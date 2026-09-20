'use strict';

const fs = require('node:fs');
const fsp = fs.promises;
const path = require('node:path');
const crypto = require('node:crypto');
const { once } = require('node:events');

const RESERVED = new Set([
  'CON','PRN','AUX','NUL',
  'COM1','COM2','COM3','COM4','COM5','COM6','COM7','COM8','COM9',
  'LPT1','LPT2','LPT3','LPT4','LPT5','LPT6','LPT7','LPT8','LPT9'
]);

function sanitizeSegment(value, fallback = 'Dosya') {
  let out = String(value || '')
    .normalize('NFKC')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/[. ]+$/g, '')
    .trim();
  if (!out) out = fallback;
  if (RESERVED.has(out.toUpperCase())) out = `_${out}`;
  return out.slice(0, 100);
}

function safeRelative(rel) {
  const raw = String(rel || '').trim();
  if (!raw) return '';
  const normalized = path.normalize(raw);
  if (path.isAbsolute(normalized)) return '';
  const parts = normalized.split(path.sep);
  if (parts.some((p) => p === '..' || p === '')) return '';
  return normalized;
}

function pathCmp(value) {
  const out = path.resolve(String(value || ''));
  return process.platform === 'win32' ? out.toLowerCase() : out;
}

function lexicallyInside(root, target) {
  const r = pathCmp(root);
  const t = pathCmp(target);
  const rel = path.relative(r, t);
  return rel === '' || (!rel.startsWith('..' + path.sep) && rel !== '..' && !path.isAbsolute(rel));
}

function realpathNative(value) {
  const fn = fs.realpathSync.native || fs.realpathSync;
  return fn(value);
}

function nearestExisting(value) {
  let current = path.resolve(value);
  while (!fs.existsSync(current)) {
    const parent = path.dirname(current);
    if (parent === current) return '';
    current = parent;
  }
  return current;
}

function containsLinkBetween(root, target) {
  const rootResolved = path.resolve(root);
  const targetResolved = path.resolve(target);
  const rel = path.relative(rootResolved, targetResolved);
  if (!rel) return false;
  let cursor = rootResolved;
  for (const segment of rel.split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, segment);
    if (!fs.existsSync(cursor)) break;
    try {
      if (fs.lstatSync(cursor).isSymbolicLink()) return true;
    } catch { return true; }
  }
  return false;
}

/**
 * Containment check that also rejects symbolic-link / junction traversal.
 * For a destination that does not exist yet, its nearest existing ancestor is
 * canonicalized so a junction inside the managed tree cannot escape the root.
 */
function isInside(root, target) {
  const r = path.resolve(root);
  const t = path.resolve(target);
  if (!lexicallyInside(r, t)) return false;
  try {
    const rootReal = realpathNative(r);
    const existing = nearestExisting(t);
    if (!existing) return false;
    const existingReal = realpathNative(existing);
    if (!lexicallyInside(rootReal, existingReal)) return false;
    if (containsLinkBetween(r, t)) return false;
    return true;
  } catch {
    return false;
  }
}

function isInsideAny(roots, target) {
  return (roots || []).some((root) => root && isInside(root, target));
}

async function ensureDir(dir) {
  await fsp.mkdir(dir, { recursive: true });
  return dir;
}

async function pathExists(p) {
  try { await fsp.access(p); return true; } catch { return false; }
}

async function uniqueDestination(dir, originalName) {
  const safe = sanitizeSegment(originalName, 'dosya');
  const parsed = path.parse(safe);
  let candidate = path.join(dir, safe);
  if (!(await pathExists(candidate))) return candidate;
  for (let i = 2; i < 10000; i++) {
    candidate = path.join(dir, `${parsed.name} (${i})${parsed.ext}`);
    if (!(await pathExists(candidate))) return candidate;
  }
  throw new Error('Aynı isimde çok fazla dosya var.');
}

/* Native layout: <root>/<Folder>/<Subfolder>/.../<Page>/Dosyalar/<file> */
function pageFolderFromMeta(meta = {}) {
  const rawPath = Array.isArray(meta.categoryPath) && meta.categoryPath.length
    ? meta.categoryPath
    : [meta.category || 'Klasorler'];
  const folders = rawPath.map((x) => sanitizeSegment(x || 'Klasor', 'Klasor')).filter(Boolean).slice(0, 32);
  const page = sanitizeSegment(meta.pageTitle || 'Not', 'Not');
  return path.join(...folders, page, 'Dosyalar');
}


async function fsyncFile(filePath) {
  let handle;
  try {
    // Windows can return EPERM for fsync on a regular file opened read-only,
    // and a few virtual/cloud-backed providers reject fsync entirely. Open r+
    // when possible; if sync itself is unsupported, continue with the existing
    // byte-count + SHA-256 verification instead of failing a valid copy.
    try {
      handle = await fsp.open(filePath, 'r+');
    } catch (openErr) {
      if (!['EPERM', 'EINVAL', 'ENOSYS', 'ENOTSUP'].includes(openErr && openErr.code)) throw openErr;
      handle = await fsp.open(filePath, 'r');
    }
    try {
      await handle.sync();
      return true;
    } catch (syncErr) {
      if (['EPERM', 'EINVAL', 'ENOSYS', 'ENOTSUP'].includes(syncErr && syncErr.code)) return false;
      throw syncErr;
    }
  } finally {
    if (handle) await handle.close().catch(() => {});
  }
}

async function waitTransferControl(control) {
  if (!control) return;
  if (typeof control.waitIfPaused === 'function') await control.waitIfPaused();
  if (control.cancelled) {
    const err = new Error('Aktarım iptal edildi.');
    err.code = 'VELORIA_CANCELLED';
    throw err;
  }
}

async function copyThenDelete(source, destination, onProgress, control) {
  const st = await fsp.stat(source);
  let done = 0;
  const srcHash = crypto.createHash('sha256');
  const read = fs.createReadStream(source, { highWaterMark: 8 * 1024 * 1024 });
  const write = fs.createWriteStream(destination, { flags: 'wx' });
  try {
    for await (const chunk of read) {
      await waitTransferControl(control);
      srcHash.update(chunk);
      if (!write.write(chunk)) await once(write, 'drain');
      done += chunk.length;
      if (onProgress) onProgress({ stage: 'move', bytes: done, total: st.size, percent: st.size ? done / st.size * 100 : 100 });
    }
    write.end();
    await once(write, 'finish');
    await fsyncFile(destination);
    const dstStat = await fsp.stat(destination);
    if (dstStat.size !== st.size) throw new Error('Dosya doğrulaması başarısız oldu. Kaynak dosya silinmedi.');
    await waitTransferControl(control);
    const expected = srcHash.digest('hex');
    const actual = await hashFile(destination, (p) => onProgress && onProgress({ ...p, stage: 'verify' }), control);
    if (expected !== actual) throw new Error('SHA-256 doğrulaması başarısız oldu. Kaynak dosya silinmedi.');
    await fsp.unlink(source);
  } catch (err) {
    read.destroy();
    write.destroy();
    await fsp.rm(destination, { force: true }).catch(() => {});
    throw err;
  }
}

async function moveFile(source, destination, onProgress, control) {
  const src = path.resolve(source);
  const dst = path.resolve(destination);
  if (src === dst) return { method: 'existing' };
  const st = await fsp.stat(src);
  if (!st.isFile()) throw new Error('Yalnızca dosyalar taşınabilir.');
  await ensureDir(path.dirname(dst));
  if (onProgress) onProgress({ stage: 'move', bytes: 0, total: st.size, percent: 0 });
  try {
    await fsp.rename(src, dst);
    if (onProgress) onProgress({ stage: 'move', bytes: st.size, total: st.size, percent: 100 });
    return { method: 'rename' };
  } catch (err) {
    if (!['EXDEV', 'EPERM', 'EACCES'].includes(err && err.code)) throw err;
  }
  await copyThenDelete(src, dst, onProgress, control);
  return { method: 'copy-delete' };
}

async function copyFileVerified(source, destination, onProgress, control) {
  const src = path.resolve(source);
  const dst = path.resolve(destination);
  if (src === dst) return { method: 'existing' };
  const st = await fsp.stat(src);
  if (!st.isFile()) throw new Error('Yalnızca dosyalar kopyalanabilir.');
  await ensureDir(path.dirname(dst));
  let done = 0;
  const sourceHash = crypto.createHash('sha256');
  const read = fs.createReadStream(src, { highWaterMark: 8 * 1024 * 1024 });
  const write = fs.createWriteStream(dst, { flags: 'wx' });
  try {
    for await (const chunk of read) {
      await waitTransferControl(control);
      sourceHash.update(chunk);
      if (!write.write(chunk)) await once(write, 'drain');
      done += chunk.length;
      if (onProgress) onProgress({ stage: 'copy', bytes: done, total: st.size, percent: st.size ? done / st.size * 100 : 100 });
    }
    write.end();
    await once(write, 'finish');
    await fsyncFile(dst);
    const dstStat = await fsp.stat(dst);
    if (dstStat.size !== st.size) throw new Error('Kopya boyutu doğrulanamadı.');
    const expected = sourceHash.digest('hex');
    const actual = await hashFile(dst, (p) => onProgress && onProgress({ ...p, stage: 'verify' }), control);
    if (expected !== actual) throw new Error('Kopya SHA-256 doğrulaması başarısız.');
    return { method: 'copy', sha256: expected };
  } catch (err) {
    read.destroy();
    write.destroy();
    await fsp.rm(dst, { force: true }).catch(() => {});
    throw err;
  }
}

function mimeFromName(name) {
  const ext = path.extname(String(name || '')).toLowerCase();
  return ({
    '.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif','.webp':'image/webp','.svg':'image/svg+xml',
    '.pdf':'application/pdf','.zip':'application/zip','.7z':'application/x-7z-compressed','.rar':'application/vnd.rar',
    '.txt':'text/plain','.md':'text/markdown','.json':'application/json','.jsonc':'application/json','.csv':'text/csv',
    '.yml':'text/yaml','.yaml':'text/yaml','.toml':'text/plain','.ini':'text/plain','.conf':'text/plain','.env':'text/plain','.log':'text/plain',
    '.js':'text/javascript','.mjs':'text/javascript','.cjs':'text/javascript','.ts':'text/typescript','.tsx':'text/typescript','.jsx':'text/javascript',
    '.css':'text/css','.scss':'text/css','.less':'text/css','.html':'text/html','.htm':'text/html','.xml':'text/xml','.py':'text/x-python',
    '.java':'text/x-java','.c':'text/x-c','.h':'text/x-c','.cpp':'text/x-c++','.hpp':'text/x-c++','.cs':'text/plain','.go':'text/plain','.rs':'text/plain','.php':'text/plain','.sh':'text/plain','.ps1':'text/plain',
    '.mp4':'video/mp4','.mkv':'video/x-matroska','.mov':'video/quicktime','.avi':'video/x-msvideo',
    '.mp3':'audio/mpeg','.wav':'audio/wav','.flac':'audio/flac',
    '.docx':'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xlsx':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.pptx':'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  })[ext] || 'application/octet-stream';
}

async function hashFile(filePath, onProgress, control) {
  const st = await fsp.stat(filePath);
  const hash = crypto.createHash('sha256');
  let done = 0;
  const stream = fs.createReadStream(filePath, { highWaterMark: 8 * 1024 * 1024 });
  for await (const chunk of stream) {
    await waitTransferControl(control);
    hash.update(chunk);
    done += chunk.length;
    if (onProgress) onProgress({ stage: 'hash', bytes: done, total: st.size, percent: st.size ? done / st.size * 100 : 100 });
  }
  return hash.digest('hex');
}

async function readIndex(indexPath) {
  if (!indexPath) return { version: 2, updatedAt: '', files: [] };
  try {
    const raw = JSON.parse(await fsp.readFile(indexPath, 'utf8'));
    if (!raw || typeof raw !== 'object') throw new Error();
    const files = Array.isArray(raw.files) ? raw.files : [];
    return { version: 2, updatedAt: raw.updatedAt || '', files };
  } catch {
    return { version: 2, updatedAt: '', files: [] };
  }
}

async function writeIndex(indexPath, index) {
  if (!indexPath) return;
  index.version = 2;
  index.updatedAt = new Date().toISOString();
  index.files = Array.isArray(index.files) ? index.files : [];
  await writeAtomic(indexPath, JSON.stringify(index, null, 2));
}

function indexKey(p) {
  const normalized = path.resolve(p);
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

async function walkManagedFiles(root, out) {
  const stack = [path.resolve(root)];
  while (stack.length) {
    const dir = stack.pop();
    let entries = [];
    try { entries = await fsp.readdir(dir, { withFileTypes: true }); } catch { continue; }
    for (const ent of entries) {
      if (ent.name === '_Veloria') continue;
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) stack.push(full);
      else if (ent.isFile()) {
        try {
          const st = await fsp.stat(full);
          out.push({
            nativePath: full,
            relativePath: path.relative(root, full),
            rootPath: root,
            name: ent.name,
            size: st.size,
            mtimeMs: st.mtimeMs,
            type: mimeFromName(ent.name)
          });
        } catch {}
      }
    }
  }
}

async function refreshManagedIndex({ roots, indexPath }) {
  const cleanRoots = [...new Set((roots || []).filter(Boolean).map((x) => path.resolve(x)))];
  const existing = await readIndex(indexPath);
  const oldByPath = new Map(existing.files.map((x) => [indexKey(x.nativePath || ''), x]));
  const scanned = [];
  for (const root of cleanRoots) await walkManagedFiles(root, scanned);
  const files = scanned.map((f) => {
    const old = oldByPath.get(indexKey(f.nativePath));
    const same = old && Number(old.size) === Number(f.size) && Number(old.mtimeMs || 0) === Number(f.mtimeMs || 0);
    return {
      ...f,
      sha256: same ? (old.sha256 || '') : '',
      ownerPageId: old?.ownerPageId || '',
      ownerCategory: old?.ownerCategory || '',
      ownerPageTitle: old?.ownerPageTitle || '',
      addedAt: old?.addedAt || ''
    };
  });
  const index = { version: 2, updatedAt: new Date().toISOString(), files };
  await writeIndex(indexPath, index);
  return index;
}

async function ensureCandidateHash(candidate, index, indexPath, onProgress, control) {
  if (candidate.sha256) return candidate.sha256;
  candidate.sha256 = await hashFile(candidate.nativePath, onProgress, control);
  try {
    const st = await fsp.stat(candidate.nativePath);
    candidate.size = st.size;
    candidate.mtimeMs = st.mtimeMs;
  } catch {}
  await writeIndex(indexPath, index);
  return candidate.sha256;
}

async function findDuplicate(source, stat, index, indexPath, onProgress, control) {
  const candidates = (index.files || []).filter((x) => Number(x.size) === Number(stat.size) && path.resolve(x.nativePath) !== path.resolve(source));
  if (!candidates.length) return { duplicate: null, sourceHash: '' };
  const sourceHash = await hashFile(source, onProgress, control);
  for (const candidate of candidates) {
    if (!(await pathExists(candidate.nativePath))) continue;
    const candidateHash = await ensureCandidateHash(candidate, index, indexPath, onProgress, control);
    if (candidateHash === sourceHash) return { duplicate: candidate, sourceHash };
  }
  return { duplicate: null, sourceHash };
}

function fileResult(record, extra = {}) {
  return {
    name: record.name || path.basename(record.nativePath),
    size: Number(record.size) || 0,
    type: record.type || mimeFromName(record.nativePath),
    nativePath: record.nativePath,
    relativePath: record.relativePath || '',
    rootPath: record.rootPath || '',
    pageFolderRel: record.pageFolderRel || '',
    movedBy: record.movedBy || 'existing',
    addedAt: record.addedAt || new Date().toISOString(),
    contentHash: record.sha256 || '',
    ownerPageId: record.ownerPageId || '',
    ownerCategory: record.ownerCategory || '',
    ownerPageTitle: record.ownerPageTitle || '',
    deduplicated: !!record.deduplicated,
    ...extra
  };
}

async function moveSourcesToPage({ sources, root, roots, meta = {}, indexPath, onProgress, control }) {
  if (!Array.isArray(sources) || !sources.length) return { files: [], pageFolderRel: pageFolderFromMeta(meta) };
  const importMode = meta.importMode === 'copy' ? 'copy' : 'move';
  // HF9: drag/drop and clipboard imports can explicitly require a real copy.
  // Bypass both the already-managed link shortcut and exact-content dedupe.
  const forcePhysicalCopy = importMode === 'copy' && meta.forcePhysicalCopy === true;
  const managedRoots = [...new Set([root, ...(roots || [])].filter(Boolean).map((x) => path.resolve(x)))];
  const folderRel = pageFolderFromMeta(meta);
  const pageDir = path.join(root, folderRel);
  if (!isInside(root, pageDir)) throw new Error('Geçersiz hedef klasör.');
  await ensureDir(pageDir);
  let index = await refreshManagedIndex({ roots: managedRoots, indexPath });
  const files = [];
  const errors = [];

  for (let i = 0; i < sources.length; i++) {
    const source = path.resolve(String(sources[i] || ''));
    const token = `${meta.blockId || 'attachment'}:${i}`;
    const progress = (p) => onProgress && onProgress({ ...p, token, index: i, name: path.basename(source) });
    try {
      const stat = await fsp.stat(source);
      if (!stat.isFile()) throw new Error('Yalnızca dosyalar taşınabilir.');

      /* A file already managed by Veloria can be linked to another note without another copy. */
      if (isInsideAny(managedRoots, source) && !forcePhysicalCopy) {
        const ownerRoot = managedRoots.find((r) => isInside(r, source)) || root;
        let record = index.files.find((x) => indexKey(x.nativePath) === indexKey(source));
        if (!record) {
          record = {
            nativePath: source,
            relativePath: path.relative(ownerRoot, source),
            rootPath: ownerRoot,
            name: path.basename(source),
            size: stat.size,
            mtimeMs: stat.mtimeMs,
            type: mimeFromName(source),
            sha256: '',
            ownerPageId: meta.pageId || '',
            ownerCategory: meta.category || '',
            ownerPageTitle: meta.pageTitle || '',
            addedAt: new Date().toISOString()
          };
          index.files.push(record);
          await writeIndex(indexPath, index);
        }
        progress({ stage: 'link', bytes: stat.size, total: stat.size, percent: 100 });
        files.push(fileResult({ ...record, movedBy: 'existing', deduplicated: true }, { pageFolderRel: folderRel }));
        continue;
      }

      /* Exact-content deduplication: same bytes => reuse canonical managed file. */
      const duplicateCheck = forcePhysicalCopy
        ? { duplicate: null, sourceHash: '' }
        : await findDuplicate(source, stat, index, indexPath, progress, control);
      if (duplicateCheck.duplicate) {
        let sourceRemoved = false;
        if (importMode === 'move') {
          try { await fsp.unlink(source); sourceRemoved = true; } catch { sourceRemoved = false; }
        }
        const dup = duplicateCheck.duplicate;
        progress({ stage: 'dedupe', bytes: stat.size, total: stat.size, percent: 100 });
        files.push(fileResult({ ...dup, movedBy: importMode === 'copy' ? 'deduplicated-copy-link' : 'deduplicated', deduplicated: true }, {
          pageFolderRel: folderRel,
          sourceRemoved,
          sourceKept: importMode === 'copy',
          contentHash: duplicateCheck.sourceHash || dup.sha256 || ''
        }));
        if (importMode === 'move' && !sourceRemoved) errors.push({ name: path.basename(source), warning: true, error: 'Ayni dosya zaten Veloria\'da. Mevcut dosyaya baglandi fakat kaynak silinemedi.' });
        continue;
      }

      const destination = await uniqueDestination(pageDir, path.basename(source));
      // Import-time MOVE is intentionally copy-verify-commit-delete instead of rename-first.
      // The original is preserved until the managed copy and index record are durable, so a
      // renderer/index/cancel failure can never make the only copy disappear.
      const copied = await copyFileVerified(source, destination, progress, control);
      await waitTransferControl(control);
      const finalStat = await fsp.stat(destination);
      const record = {
        nativePath: destination,
        relativePath: path.relative(root, destination),
        rootPath: root,
        name: path.basename(destination),
        size: finalStat.size,
        mtimeMs: finalStat.mtimeMs,
        type: mimeFromName(destination),
        sha256: duplicateCheck.sourceHash || copied.sha256 || '',
        ownerPageId: meta.pageId || '',
        ownerCategory: meta.category || '',
        ownerPageTitle: meta.pageTitle || '',
        addedAt: new Date().toISOString()
      };
      try {
        const nextIndex = { ...index, files: index.files.filter((x) => indexKey(x.nativePath) !== indexKey(destination)) };
        nextIndex.files.push(record);
        await writeIndex(indexPath, nextIndex);
        index = nextIndex;
      } catch (commitErr) {
        await fsp.rm(destination, { force: true }).catch(() => {});
        throw commitErr;
      }
      await waitTransferControl(control);
      let sourceRemoved = false;
      if (importMode === 'move') {
        try { await fsp.unlink(source); sourceRemoved = true; }
        catch (unlinkErr) { errors.push({ name: path.basename(source), warning: true, error: 'Dosya Veloria’ya güvenle kopyalandı ancak kaynak dosya silinemedi; orijinal yerinde bırakıldı.' }); }
      }
      files.push(fileResult({ ...record, movedBy: importMode === 'move' && sourceRemoved ? 'verified-copy-delete' : 'copy' }, { pageFolderRel: folderRel, sourceRemoved, sourceKept: importMode !== 'move' || !sourceRemoved }));
    } catch (err) {
      if (err && err.code === 'VELORIA_CANCELLED') {
        errors.push({ name: path.basename(source), warning: true, cancelled: true, error: 'Dosya aktarımı iptal edildi; kaynak dosya korunuyor.' });
        break;
      }
      errors.push({ name: path.basename(source), error: err && err.message ? err.message : 'Dosya tasinamadi' });
    }
  }
  return { files, errors, pageFolderRel: folderRel, importMode };
}


async function copyDirectoryToPage({ source, root, roots, meta = {}, indexPath, onProgress, control }) {
  const managedRoots = [...new Set([root, ...(roots || [])].filter(Boolean).map((x) => path.resolve(x)))];
  const sourceDir = path.resolve(String(source || ''));
  const sourceStat = await fsp.stat(sourceDir);
  if (!sourceStat.isDirectory()) throw new Error('Kaynak bir klasör değil.');
  const folderRel = pageFolderFromMeta(meta);
  const pageDir = path.join(root, folderRel);
  if (!isInside(root, pageDir)) throw new Error('Geçersiz hedef klasör.');
  await ensureDir(pageDir);
  const destination = await uniqueDestination(pageDir, sanitizeSegment(path.basename(sourceDir), 'Klasor'));
  if (isInside(sourceDir, destination)) throw new Error('Bir klasör kendi içine kopyalanamaz.');

  const dirs = [];
  const files = [];
  const stack = [{ full: sourceDir, rel: '' }];
  while (stack.length) {
    const cur = stack.pop();
    let entries = await fsp.readdir(cur.full, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const ent of entries) {
      if (ent.isSymbolicLink()) continue;
      const full = path.join(cur.full, ent.name);
      const rel = cur.rel ? path.join(cur.rel, ent.name) : ent.name;
      if (ent.isDirectory()) { dirs.push(rel); stack.push({ full, rel }); }
      else if (ent.isFile()) { const st = await fsp.stat(full); files.push({ full, rel, size: st.size }); }
      if (files.length + dirs.length > 30000) throw new Error('Klasör 30.000 öğe önizleme/kopyalama sınırını aşıyor.');
    }
  }

  const total = files.reduce((n, x) => n + x.size, 0);
  let done = 0;
  await ensureDir(destination);
  try {
    for (const rel of dirs) await ensureDir(path.join(destination, rel));
    for (let i = 0; i < files.length; i++) {
      const item = files[i];
      const target = path.join(destination, item.rel);
      await ensureDir(path.dirname(target));
      await copyFileVerified(item.full, target, (p) => {
        const bytes = done + Number(p.bytes || p.loaded || 0);
        onProgress?.({ ...p, stage: 'copy-folder', name: path.basename(item.full), index: i, bytes, loaded: bytes, total, percent: total ? Math.min(100, bytes / total * 100) : 100 });
      }, control);
      done += item.size;
    }
    let index = await refreshManagedIndex({ roots: managedRoots, indexPath });
    for (const rec of index.files || []) {
      if (!isInside(destination, rec.nativePath || '')) continue;
      rec.ownerPageId = meta.pageId || '';
      rec.ownerCategory = meta.category || '';
      rec.ownerPageTitle = meta.pageTitle || '';
      rec.addedAt = rec.addedAt || new Date().toISOString();
    }
    await writeIndex(indexPath, index);
    onProgress?.({ stage: 'copy-folder', name: path.basename(sourceDir), bytes: total, loaded: total, total, percent: 100 });
    return { kind: 'folder', nativePath: destination, relativePath: path.relative(root, destination), rootPath: root, name: path.basename(destination), size: total, entryCount: files.length + dirs.length, type: 'inode/directory', sourceKept: true, movedBy: 'copy-directory', pageFolderRel: folderRel };
  } catch (err) {
    await fsp.rm(destination, { recursive: true, force: true }).catch(() => {});
    throw err;
  }
}

async function organizeManagedFile({ filePath, root, roots, meta = {}, indexPath, onProgress, control }) {
  const managedRoots = [...new Set([root, ...(roots || [])].filter(Boolean).map((x) => path.resolve(x)))];
  const source = path.resolve(String(filePath || ''));
  if (!isInsideAny(managedRoots, source)) throw new Error('Dosya Veloria Notes tarafından yönetilmiyor.');
  const st = await fsp.stat(source);
  if (!st.isFile()) throw new Error('Yalnızca dosya düzenlenebilir.');
  const folderRel = pageFolderFromMeta(meta);
  const pageDir = path.join(root, folderRel);
  await ensureDir(pageDir);
  if (path.resolve(path.dirname(source)) === path.resolve(pageDir)) {
    return fileResult({
      nativePath: source, relativePath: path.relative(root, source), rootPath: root,
      name: path.basename(source), size: st.size, mtimeMs: st.mtimeMs, type: mimeFromName(source),
      ownerPageId: meta.pageId || '', ownerCategory: meta.category || '', ownerPageTitle: meta.pageTitle || '',
      pageFolderRel: folderRel, movedBy: 'existing'
    });
  }

  let index = await refreshManagedIndex({ roots: managedRoots, indexPath });
  const targetSameName = path.join(pageDir, sanitizeSegment(path.basename(source), 'dosya'));
  let destination = targetSameName;
  if (await pathExists(destination)) {
    const dstStat = await fsp.stat(destination);
    if (dstStat.isFile() && dstStat.size === st.size) {
      const [srcHash, dstHash] = await Promise.all([hashFile(source), hashFile(destination)]);
      if (srcHash === dstHash) {
        await fsp.rm(source, { force: true });
        index = await refreshManagedIndex({ roots: managedRoots, indexPath });
        const rec = index.files.find((x) => indexKey(x.nativePath) === indexKey(destination));
        return fileResult({ ...rec, ownerPageId: meta.pageId || '', ownerCategory: meta.category || '', ownerPageTitle: meta.pageTitle || '', pageFolderRel: folderRel, movedBy: 'deduplicated', deduplicated: true });
      }
    }
    destination = await uniqueDestination(pageDir, path.basename(source));
  }
  const moved = await moveFile(source, destination, onProgress, control);
  const finalStat = await fsp.stat(destination);
  index = await refreshManagedIndex({ roots: managedRoots, indexPath });
  const rec = index.files.find((x) => indexKey(x.nativePath) === indexKey(destination));
  if (rec) {
    rec.ownerPageId = meta.pageId || '';
    rec.ownerCategory = meta.category || '';
    rec.ownerPageTitle = meta.pageTitle || '';
    rec.addedAt = rec.addedAt || new Date().toISOString();
    await writeIndex(indexPath, index);
  }
  return fileResult({ ...(rec || {}), nativePath: destination, relativePath: path.relative(root, destination), rootPath: root, name: path.basename(destination), size: finalStat.size, mtimeMs: finalStat.mtimeMs, type: mimeFromName(destination), pageFolderRel: folderRel, movedBy: moved.method });
}

async function removeIndexEntry(indexPath, filePath) {
  const index = await readIndex(indexPath);
  const key = indexKey(filePath);
  index.files = index.files.filter((x) => indexKey(x.nativePath || '') !== key);
  await writeIndex(indexPath, index);
}


function findManagedRoot(roots, target) {
  const p = path.resolve(String(target || ''));
  return (roots || []).map((x) => x && path.resolve(x)).find((r) => r && isInside(r, p)) || '';
}

function fileVersionId(filePath) {
  return crypto.createHash('sha1').update(indexKey(filePath)).digest('hex').slice(0, 20);
}

async function replaceManagedVersion({ filePath, replacementPath, roots, indexPath, onProgress, control }) {
  const current = path.resolve(String(filePath || ''));
  const incoming = path.resolve(String(replacementPath || ''));
  const root = findManagedRoot(roots, current);
  if (!root) throw new Error('Yönetilen dosyanın depolama kökü bulunamadı.');
  const curStat = await fsp.stat(current);
  const newStat = await fsp.stat(incoming);
  if (!curStat.isFile() || !newStat.isFile()) throw new Error('Yalnızca dosyalar sürümlendirilebilir.');
  const curHash = await hashFile(current, (p) => onProgress?.({ ...p, stage: 'hash-current' }), control);
  const newHash = await hashFile(incoming, (p) => onProgress?.({ ...p, stage: 'hash-new' }), control);
  if (curHash === newHash) {
    if (!isInsideAny(roots, incoming)) await fsp.rm(incoming, { force: true }).catch(() => {});
    return { unchanged: true, nativePath: current, contentHash: curHash, versionCreated: false };
  }
  const versionDir = path.join(root, '_Veloria', 'Versions', fileVersionId(current));
  await ensureDir(versionDir);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const oldVersionPath = await uniqueDestination(versionDir, `${stamp}__${path.basename(current)}`);
  await moveFile(current, oldVersionPath, (p) => onProgress?.({ ...p, stage: 'archive-version' }), control);
  try {
    await moveFile(incoming, current, (p) => onProgress?.({ ...p, stage: 'install-version' }), control);
  } catch (e) {
    await moveFile(oldVersionPath, current, null, control).catch(() => {});
    throw e;
  }
  const st = await fsp.stat(current);
  let index = await refreshManagedIndex({ roots, indexPath });
  const rec = index.files.find((x) => indexKey(x.nativePath || '') === indexKey(current));
  if (rec) {
    rec.sha256 = newHash;
    rec.addedAt = rec.addedAt || new Date().toISOString();
    await writeIndex(indexPath, index);
  }
  return fileResult({ ...(rec || {}), nativePath: current, rootPath: root, relativePath: path.relative(root, current), name: path.basename(current), size: st.size, mtimeMs: st.mtimeMs, type: mimeFromName(current), sha256: newHash }, { oldVersionPath, versionCreated: true });
}

async function listManagedVersions({ filePath, roots }) {
  const current = path.resolve(String(filePath || ''));
  const root = findManagedRoot(roots, current);
  if (!root) return [];
  const versionDir = path.join(root, '_Veloria', 'Versions', fileVersionId(current));
  let names = [];
  try { names = await fsp.readdir(versionDir); } catch { return []; }
  const out = [];
  for (const name of names) {
    const full = path.join(versionDir, name);
    try {
      const st = await fsp.stat(full);
      if (!st.isFile()) continue;
      out.push({ id: name, path: full, name: name.replace(/^.*?__/, ''), size: st.size, mtimeMs: st.mtimeMs });
    } catch {}
  }
  return out.sort((a, b) => b.mtimeMs - a.mtimeMs);
}

async function restoreManagedVersion({ filePath, versionId, roots, indexPath, onProgress, control }) {
  const current = path.resolve(String(filePath || ''));
  const root = findManagedRoot(roots, current);
  if (!root) throw new Error('Yönetilen dosyanın depolama kökü bulunamadı.');
  const versionDir = path.join(root, '_Veloria', 'Versions', fileVersionId(current));
  const selected = path.resolve(versionDir, String(versionId || ''));
  if (!isInside(versionDir, selected)) throw new Error('Geçersiz sürüm.');
  const st = await fsp.stat(selected);
  if (!st.isFile()) throw new Error('Sürüm dosyası bulunamadı.');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupCurrent = await uniqueDestination(versionDir, `${stamp}__${path.basename(current)}`);
  await moveFile(current, backupCurrent, (p) => onProgress?.({ ...p, stage: 'archive-current' }), control);
  try {
    await moveFile(selected, current, (p) => onProgress?.({ ...p, stage: 'restore-version' }), control);
  } catch (e) {
    await moveFile(backupCurrent, current, null, control).catch(() => {});
    throw e;
  }
  const hash = await hashFile(current, null, control);
  const index = await refreshManagedIndex({ roots, indexPath });
  const rec = index.files.find((x) => indexKey(x.nativePath || '') === indexKey(current));
  if (rec) { rec.sha256 = hash; await writeIndex(indexPath, index); }
  const finalStat = await fsp.stat(current);
  return fileResult({ ...(rec || {}), nativePath: current, rootPath: root, relativePath: path.relative(root, current), name: path.basename(current), size: finalStat.size, mtimeMs: finalStat.mtimeMs, type: mimeFromName(current), sha256: hash }, { restored: true });
}

async function moveManagedToTrash({ filePath, roots, trashIndexPath, indexPath, onProgress, control }) {
  const current = path.resolve(String(filePath || ''));
  const root = findManagedRoot(roots, current);
  if (!root) throw new Error('Yönetilen dosyanın depolama kökü bulunamadı.');
  const st = await fsp.stat(current);
  if (!st.isFile()) throw new Error('Yalnızca dosyalar çöp kutusuna taşınabilir.');
  const id = crypto.randomBytes(12).toString('hex');
  const day = new Date().toISOString().slice(0, 10);
  const trashDir = path.join(root, '_Veloria', 'Trash', day);
  await ensureDir(trashDir);
  const target = await uniqueDestination(trashDir, `${id}__${path.basename(current)}`);
  await moveFile(current, target, onProgress, control);
  let trash = { version: 1, items: [] };
  try { trash = JSON.parse(await fsp.readFile(trashIndexPath, 'utf8')); } catch {}
  if (!Array.isArray(trash.items)) trash.items = [];
  trash.items.unshift({ id, originalPath: current, trashPath: target, rootPath: root, name: path.basename(current), size: st.size, deletedAt: new Date().toISOString() });
  await writeAtomic(trashIndexPath, JSON.stringify(trash, null, 2));
  await removeIndexEntry(indexPath, current).catch(() => {});
  return trash.items[0];
}

async function listTrash(trashIndexPath) {
  let trash = { version: 1, items: [] };
  try { trash = JSON.parse(await fsp.readFile(trashIndexPath, 'utf8')); } catch {}
  const items = Array.isArray(trash.items) ? trash.items : [];
  const out = [];
  for (const item of items) {
    if (await pathExists(item.trashPath)) out.push(item);
  }
  return out.sort((a, b) => String(b.deletedAt || '').localeCompare(String(a.deletedAt || '')));
}

async function restoreTrashItem({ id, trashIndexPath, roots, indexPath, onProgress, control }) {
  let trash = { version: 1, items: [] };
  try { trash = JSON.parse(await fsp.readFile(trashIndexPath, 'utf8')); } catch {}
  const item = (trash.items || []).find((x) => x.id === id);
  if (!item) throw new Error('Çöp kutusu öğesi bulunamadı.');
  if (!(await pathExists(item.trashPath))) throw new Error('Çöp kutusundaki dosya eksik.');
  let target = item.originalPath;
  await ensureDir(path.dirname(target));
  if (await pathExists(target)) target = await uniqueDestination(path.dirname(target), path.basename(target));
  await moveFile(item.trashPath, target, onProgress, control);
  trash.items = (trash.items || []).filter((x) => x.id !== id);
  await writeAtomic(trashIndexPath, JSON.stringify(trash, null, 2));
  await refreshManagedIndex({ roots, indexPath });
  return { ...item, restoredPath: target };
}

async function purgeTrash({ trashIndexPath, olderThanDays = 30 }) {
  let trash = { version: 1, items: [] };
  try { trash = JSON.parse(await fsp.readFile(trashIndexPath, 'utf8')); } catch {}
  const cutoff = Date.now() - Math.max(1, Number(olderThanDays) || 30) * 86400000;
  const keep = [];
  let purged = 0;
  for (const item of trash.items || []) {
    const old = Date.parse(item.deletedAt || 0) < cutoff;
    if (old) { await fsp.rm(item.trashPath, { force: true }).catch(() => {}); purged++; }
    else if (await pathExists(item.trashPath)) keep.push(item);
  }
  trash.items = keep;
  await writeAtomic(trashIndexPath, JSON.stringify(trash, null, 2));
  return { purged, remaining: keep.length };
}

async function moveManagedToRoot({ filePath, targetRoot, roots, meta = {}, indexPath, onProgress, control }) {
  const source = path.resolve(String(filePath || ''));
  if (!findManagedRoot(roots, source)) throw new Error('Kaynak dosya Veloria Notes tarafından yönetilmiyor.');
  const targetBase = path.resolve(String(targetRoot || ''));
  await ensureDir(targetBase);
  const folderRel = pageFolderFromMeta(meta);
  const dir = path.join(targetBase, folderRel);
  await ensureDir(dir);
  let destination = path.join(dir, sanitizeSegment(path.basename(source), 'file'));
  if (await pathExists(destination)) {
    const [a, b] = await Promise.all([hashFile(source, null, control), hashFile(destination, null, control)]);
    if (a === b) {
      await fsp.rm(source, { force: true });
      await refreshManagedIndex({ roots: [...new Set([...roots, targetBase])], indexPath });
      const st = await fsp.stat(destination);
      return fileResult({ nativePath: destination, rootPath: targetBase, relativePath: path.relative(targetBase, destination), name: path.basename(destination), size: st.size, mtimeMs: st.mtimeMs, type: mimeFromName(destination), sha256: b, deduplicated: true }, { pageFolderRel: folderRel });
    }
    destination = await uniqueDestination(dir, path.basename(source));
  }
  const moved = await moveFile(source, destination, onProgress, control);
  const allRoots = [...new Set([...roots, targetBase])];
  const index = await refreshManagedIndex({ roots: allRoots, indexPath });
  const rec = index.files.find((x) => indexKey(x.nativePath || '') === indexKey(destination));
  const st = await fsp.stat(destination);
  return fileResult({ ...(rec || {}), nativePath: destination, rootPath: targetBase, relativePath: path.relative(targetBase, destination), name: path.basename(destination), size: st.size, mtimeMs: st.mtimeMs, type: mimeFromName(destination), movedBy: moved.method }, { pageFolderRel: folderRel });
}

async function writeAtomic(filePath, text) {
  await ensureDir(path.dirname(filePath));
  const tmp = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  const bak = `${filePath}.bak-${process.pid}-${Date.now()}`;
  await fsp.writeFile(tmp, text, 'utf8');
  try {
    await fsp.rename(tmp, filePath);
  } catch (err) {
    if (!['EEXIST','EPERM','ENOTEMPTY','EACCES'].includes(err && err.code)) {
      await fsp.rm(tmp, { force: true }).catch(() => {});
      throw err;
    }
    let hadOld = false;
    try { await fsp.rename(filePath, bak); hadOld = true; } catch (moveErr) {
      if (moveErr && moveErr.code !== 'ENOENT') {
        await fsp.rm(tmp, { force: true }).catch(() => {});
        throw moveErr;
      }
    }
    try {
      await fsp.rename(tmp, filePath);
      if (hadOld) await fsp.rm(bak, { force: true }).catch(() => {});
    } catch (replaceErr) {
      if (hadOld) await fsp.rename(bak, filePath).catch(() => {});
      await fsp.rm(tmp, { force: true }).catch(() => {});
      throw replaceErr;
    }
  }
}

module.exports = {
  sanitizeSegment,
  safeRelative,
  isInside,
  isInsideAny,
  ensureDir,
  pathExists,
  uniqueDestination,
  pageFolderFromMeta,
  moveFile,
  copyFileVerified,
  moveSourcesToPage,
  copyDirectoryToPage,
  organizeManagedFile,
  mimeFromName,
  hashFile,
  readIndex,
  writeIndex,
  refreshManagedIndex,
  removeIndexEntry,
  findManagedRoot,
  replaceManagedVersion,
  listManagedVersions,
  restoreManagedVersion,
  moveManagedToTrash,
  listTrash,
  restoreTrashItem,
  purgeTrash,
  moveManagedToRoot,
  writeAtomic
};
