'use strict';

const fs = require('node:fs');
const fsp = fs.promises;
const path = require('node:path');
const zlib = require('node:zlib');
const { execFile, execFileSync } = require('node:child_process');
const { promisify } = require('node:util');
const execFileAsync = promisify(execFile);

const MAX_ARCHIVE_ENTRIES = 12000;
const MAX_DIRECTORY_ENTRIES = 12000;
const MAX_CENTRAL_DIRECTORY = 64 * 1024 * 1024;
const MAX_TAR_BYTES = 256 * 1024 * 1024;
const MAX_EXTRACTED_ENTRY = 128 * 1024 * 1024;

function decodeZipName(buf, flags) {
  try { return buf.toString((flags & 0x800) ? 'utf8' : 'utf8'); } catch { return buf.toString('utf8'); }
}

function normalizeEntryPath(value) {
  const s = String(value || '').replace(/\\/g, '/').replace(/^\/+/, '');
  const parts = s.split('/').filter(Boolean);
  if (!parts.length || parts.some((x) => x === '..' || x === '.')) throw new Error('Arşiv girdisi geçersiz.');
  return parts.join('/');
}

async function readRange(filePath, offset, length) {
  const h = await fsp.open(filePath, 'r');
  try {
    const b = Buffer.alloc(length);
    const r = await h.read(b, 0, length, offset);
    return b.subarray(0, r.bytesRead);
  } finally { await h.close(); }
}

async function readZipDirectory(filePath) {
  const st = await fsp.stat(filePath);
  const tailLen = Math.min(st.size, 65557);
  const tail = await readRange(filePath, Math.max(0, st.size - tailLen), tailLen);
  let eocd = -1;
  for (let i = tail.length - 22; i >= 0; i--) {
    if (tail.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('ZIP merkez dizini bulunamadı. Arşiv bozuk veya desteklenmeyen ZIP64 yapısında olabilir.');
  const total = tail.readUInt16LE(eocd + 10);
  const centralSize = tail.readUInt32LE(eocd + 12);
  const centralOffset = tail.readUInt32LE(eocd + 16);
  if (total === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff) throw new Error('ZIP64 arşivleri bu dahili görüntüleyicide henüz desteklenmiyor.');
  if (centralSize > MAX_CENTRAL_DIRECTORY) throw new Error('ZIP merkez dizini önizleme sınırını aşıyor.');
  if (centralOffset + centralSize > st.size) throw new Error('ZIP merkez dizini geçersiz.');
  const central = await readRange(filePath, centralOffset, centralSize);
  const out = [];
  let p = 0;
  while (p + 46 <= central.length && out.length < Math.min(total || MAX_ARCHIVE_ENTRIES, MAX_ARCHIVE_ENTRIES)) {
    if (central.readUInt32LE(p) !== 0x02014b50) break;
    const flags = central.readUInt16LE(p + 8);
    const method = central.readUInt16LE(p + 10);
    const crc32 = central.readUInt32LE(p + 16);
    const compressedSize = central.readUInt32LE(p + 20);
    const size = central.readUInt32LE(p + 24);
    const nameLen = central.readUInt16LE(p + 28);
    const extraLen = central.readUInt16LE(p + 30);
    const commentLen = central.readUInt16LE(p + 32);
    const localHeaderOffset = central.readUInt32LE(p + 42);
    if (p + 46 + nameLen + extraLen + commentLen > central.length) break;
    const rawName = decodeZipName(central.subarray(p + 46, p + 46 + nameLen), flags).replace(/\\/g, '/');
    const cleanName = rawName.replace(/^\/+/, '');
    if (cleanName) {
      const isDirectory = cleanName.endsWith('/');
      out.push({
        path: cleanName,
        name: path.posix.basename(cleanName.replace(/\/$/, '')) || cleanName,
        size,
        compressedSize,
        isDirectory,
        method,
        flags,
        crc32,
        localHeaderOffset,
        kind: isDirectory ? 'folder' : 'file'
      });
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  return { entries: out, truncated: total > out.length, format: 'zip' };
}

async function listZipEntries(filePath) {
  const result = await readZipDirectory(filePath);
  return {
    ...result,
    entries: result.entries.map(({ path: p, name, size, compressedSize, isDirectory, method, kind }) => ({ path: p, name, size, compressedSize, isDirectory, method, kind }))
  };
}

function parseTarEntries(buf, includeOffsets = false) {
  const out = [];
  let p = 0;
  while (p + 512 <= buf.length && out.length < MAX_ARCHIVE_ENTRIES) {
    const block = buf.subarray(p, p + 512);
    if (block.every((x) => x === 0)) break;
    const z = (b) => b.toString('utf8').replace(/\0.*$/s, '').trim();
    const name = z(block.subarray(0, 100));
    const prefix = z(block.subarray(345, 500));
    const rawFull = (prefix ? prefix + '/' : '') + name;
    const full = rawFull.replace(/\\/g, '/').replace(/^(?:\.\/)+/, '').replace(/^\/+/, '');
    const sizeRaw = z(block.subarray(124, 136)).replace(/[^0-7]/g, '');
    const size = parseInt(sizeRaw || '0', 8) || 0;
    const typeFlag = String.fromCharCode(block[156] || 48);
    const isDirectory = typeFlag === '5' || full.endsWith('/');
    const isMetadata = typeFlag === 'x' || typeFlag === 'g' || typeFlag === 'L' || typeFlag === 'K';
    if (full && full !== '.' && !isMetadata) {
      const item = { path: full, name: path.posix.basename(full.replace(/\/$/, '')) || full, size, isDirectory, kind: isDirectory ? 'folder' : 'file' };
      if (includeOffsets) item.dataOffset = p + 512;
      out.push(item);
    }
    p += 512 + Math.ceil(size / 512) * 512;
  }
  return out;
}

function parseTarBuffer(buf) {
  const out = parseTarEntries(buf, false);
  return { entries: out, truncated: out.length >= MAX_ARCHIVE_ENTRIES, format: 'tar' };
}

async function readTarBuffer(filePath, compressed = false) {
  const st = await fsp.stat(filePath);
  if (st.size > MAX_TAR_BYTES) throw new Error('TAR/TGZ önizleme sınırını aşıyor. Harici uygulamayla açabilirsin.');
  let buf = await fsp.readFile(filePath);
  if (compressed) {
    try { buf = zlib.gunzipSync(buf, { maxOutputLength: MAX_TAR_BYTES }); }
    catch (e) { throw new Error('TGZ/GZ açılamadı: ' + (e && e.message ? e.message : 'geçersiz arşiv')); }
  }
  if (buf.length > MAX_TAR_BYTES) throw new Error('Açık TAR verisi önizleme sınırını aşıyor.');
  return buf;
}

async function listTarEntries(filePath, compressed = false) {
  return parseTarBuffer(await readTarBuffer(filePath, compressed));
}

function find7z() {
  const candidates = [];
  if (process.env.ProgramFiles) candidates.push(path.join(process.env.ProgramFiles, '7-Zip', '7z.exe'));
  if (process.env['ProgramFiles(x86)']) candidates.push(path.join(process.env['ProgramFiles(x86)'], '7-Zip', '7z.exe'));
  for (const c of candidates) if (fs.existsSync(c)) return c;
  try {
    const cmd = process.platform === 'win32' ? 'where.exe' : 'which';
    const found = String(execFileSync(cmd, ['7z'], { encoding: 'utf8', windowsHide: true }) || '').split(/\r?\n/).find(Boolean);
    if (found) return found.trim();
  } catch {}
  return '';
}

async function listWith7z(filePath) {
  const bin = find7z();
  if (!bin) throw new Error('Bu RAR/7Z arşivinin içini göstermek için sistemde 7-Zip bulunamadı. Dosya yine Harici Aç ile açılabilir.');
  const { stdout } = await execFileAsync(bin, ['l', '-slt', '-ba', filePath], { encoding: 'utf8', windowsHide: true, maxBuffer: 32 * 1024 * 1024 });
  const out = [];
  let cur = {};
  const flush = () => {
    if (!cur.Path) { cur = {}; return; }
    const pth = String(cur.Path).replace(/\\/g, '/').replace(/^\/+/, '');
    if (pth) {
      const isDirectory = cur.Folder === '+' || /^D/.test(String(cur.Attributes || '')) || pth.endsWith('/');
      out.push({ path: pth, name: path.posix.basename(pth.replace(/\/$/, '')) || pth, size: Number(cur.Size) || 0, compressedSize: Number(cur['Packed Size']) || 0, isDirectory, kind: isDirectory ? 'folder' : 'file' });
    }
    cur = {};
  };
  for (const line of String(stdout || '').split(/\r?\n/)) {
    if (!line.trim()) { flush(); if (out.length >= MAX_ARCHIVE_ENTRIES) break; continue; }
    const m = line.match(/^([^=]+?)\s*=\s*(.*)$/);
    if (m) cur[m[1].trim()] = m[2];
  }
  flush();
  return { entries: out.slice(0, MAX_ARCHIVE_ENTRIES), truncated: out.length > MAX_ARCHIVE_ENTRIES, format: path.extname(filePath).slice(1).toLowerCase() };
}

async function listArchiveEntries(filePath) {
  const lower = String(filePath || '').toLowerCase();
  if (lower.endsWith('.zip')) return listZipEntries(filePath);
  if (lower.endsWith('.tar')) return listTarEntries(filePath, false);
  if (lower.endsWith('.tgz') || lower.endsWith('.tar.gz')) return listTarEntries(filePath, true);
  if (lower.endsWith('.gz')) {
    const st = await fsp.stat(filePath);
    const name = path.basename(filePath).replace(/\.gz$/i, '');
    return { entries: [{ path: name, name, size: 0, compressedSize: st.size, isDirectory: false, kind: 'file' }], truncated: false, format: 'gz', warning: 'Tek GZ dosyasi: ic dosya adi gosteriliyor; tam boyut acilinca belirlenir.' };
  }
  if (lower.endsWith('.rar') || lower.endsWith('.7z')) return listWith7z(filePath);
  throw new Error('Desteklenmeyen arşiv türü.');
}

async function readZipEntry(filePath, entryPath) {
  const wanted = normalizeEntryPath(entryPath);
  const dir = await readZipDirectory(filePath);
  const item = dir.entries.find((x) => normalizeEntryPath(x.path.replace(/\/$/, '')) === wanted);
  if (!item || item.isDirectory) throw new Error('ZIP girdisi bulunamadı veya bir klasör.');
  if (item.flags & 1) throw new Error('Şifreli ZIP girdileri dahili olarak açılamıyor.');
  if (item.size > MAX_EXTRACTED_ENTRY) throw new Error('Arşivdeki dosya 128 MB önizleme sınırını aşıyor.');
  const local = await readRange(filePath, item.localHeaderOffset, 30);
  if (local.length < 30 || local.readUInt32LE(0) !== 0x04034b50) throw new Error('ZIP yerel dosya başlığı geçersiz.');
  const nameLen = local.readUInt16LE(26);
  const extraLen = local.readUInt16LE(28);
  const dataOffset = item.localHeaderOffset + 30 + nameLen + extraLen;
  const compressed = await readRange(filePath, dataOffset, item.compressedSize);
  if (compressed.length !== item.compressedSize) throw new Error('ZIP girdisi eksik okunabildi.');
  let data;
  if (item.method === 0) data = Buffer.from(compressed);
  else if (item.method === 8) {
    try { data = zlib.inflateRawSync(compressed, { maxOutputLength: MAX_EXTRACTED_ENTRY }); }
    catch (e) { throw new Error('ZIP girdisi açılamadı: ' + (e && e.message ? e.message : 'deflate hatası')); }
  } else throw new Error(`ZIP sıkıştırma yöntemi desteklenmiyor (method ${item.method}).`);
  if (data.length > MAX_EXTRACTED_ENTRY) throw new Error('Arşivdeki dosya 128 MB önizleme sınırını aşıyor.');
  if (item.size && data.length !== item.size) throw new Error('ZIP girdisi boyut doğrulaması başarısız.');
  return { data, name: item.name, path: item.path, size: data.length };
}

async function readTarEntry(filePath, entryPath, compressed = false) {
  const wanted = normalizeEntryPath(entryPath);
  const buf = await readTarBuffer(filePath, compressed);
  const entries = parseTarEntries(buf, true);
  const item = entries.find((x) => normalizeEntryPath(x.path.replace(/\/$/, '')) === wanted);
  if (!item || item.isDirectory) throw new Error('TAR girdisi bulunamadı veya bir klasör.');
  if (item.size > MAX_EXTRACTED_ENTRY) throw new Error('Arşivdeki dosya 128 MB önizleme sınırını aşıyor.');
  const data = Buffer.from(buf.subarray(item.dataOffset, item.dataOffset + item.size));
  if (data.length !== item.size) throw new Error('TAR girdisi eksik okunabildi.');
  return { data, name: item.name, path: item.path, size: data.length };
}

async function readGzEntry(filePath, entryPath) {
  const wanted = normalizeEntryPath(entryPath);
  const expected = normalizeEntryPath(path.basename(filePath).replace(/\.gz$/i, ''));
  if (wanted !== expected) throw new Error('GZ girdisi bulunamadı.');
  let data;
  try { data = zlib.gunzipSync(await fsp.readFile(filePath), { maxOutputLength: MAX_EXTRACTED_ENTRY }); }
  catch (e) { throw new Error('GZ girdisi açılamadı: ' + (e && e.message ? e.message : 'gzip hatası')); }
  if (data.length > MAX_EXTRACTED_ENTRY) throw new Error('Arşivdeki dosya 128 MB önizleme sınırını aşıyor.');
  return { data, name: path.basename(expected), path: expected, size: data.length };
}

async function read7zEntry(filePath, entryPath) {
  const bin = find7z();
  if (!bin) throw new Error('Bu arşiv girdisini açmak için sistemde 7-Zip bulunamadı.');
  const wanted = normalizeEntryPath(entryPath);
  try {
    const { stdout } = await execFileAsync(bin, ['x', '-so', '-y', filePath, wanted], { encoding: 'buffer', windowsHide: true, maxBuffer: MAX_EXTRACTED_ENTRY + 1024 * 1024 });
    const data = Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout || '');
    if (data.length > MAX_EXTRACTED_ENTRY) throw new Error('Arşivdeki dosya 128 MB önizleme sınırını aşıyor.');
    return { data, name: path.posix.basename(wanted), path: wanted, size: data.length };
  } catch (e) {
    if (e && /128 MB/.test(String(e.message || ''))) throw e;
    throw new Error('Arşiv girdisi 7-Zip ile açılamadı: ' + (e && e.message ? e.message : 'bilinmeyen hata'));
  }
}

async function readArchiveEntry(filePath, entryPath) {
  const lower = String(filePath || '').toLowerCase();
  if (lower.endsWith('.zip')) return readZipEntry(filePath, entryPath);
  if (lower.endsWith('.tar')) return readTarEntry(filePath, entryPath, false);
  if (lower.endsWith('.tgz') || lower.endsWith('.tar.gz')) return readTarEntry(filePath, entryPath, true);
  if (lower.endsWith('.gz')) return readGzEntry(filePath, entryPath);
  if (lower.endsWith('.rar') || lower.endsWith('.7z')) return read7zEntry(filePath, entryPath);
  throw new Error('Desteklenmeyen arşiv türü.');
}

async function listDirectoryEntries(dirPath) {
  const root = path.resolve(dirPath);
  const out = [];
  const stack = [{ dir: root, rel: '', depth: 0 }];
  while (stack.length && out.length < MAX_DIRECTORY_ENTRIES) {
    const cur = stack.pop();
    let ents = [];
    try { ents = await fsp.readdir(cur.dir, { withFileTypes: true }); } catch { continue; }
    ents.sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name));
    const dirs = [];
    for (const ent of ents) {
      if (out.length >= MAX_DIRECTORY_ENTRIES) break;
      if (ent.isSymbolicLink()) continue;
      const full = path.join(cur.dir, ent.name);
      const rel = cur.rel ? path.join(cur.rel, ent.name) : ent.name;
      let size = 0;
      if (ent.isFile()) { try { size = (await fsp.stat(full)).size; } catch {} }
      out.push({ nativePath: full, path: rel.replace(/\\/g, '/'), name: ent.name, size, isDirectory: ent.isDirectory(), kind: ent.isDirectory() ? 'folder' : 'file', depth: cur.depth });
      if (ent.isDirectory() && cur.depth < 24) dirs.push({ dir: full, rel, depth: cur.depth + 1 });
    }
    for (let i = dirs.length - 1; i >= 0; i--) stack.push(dirs[i]);
  }
  return { entries: out, truncated: out.length >= MAX_DIRECTORY_ENTRIES, format: 'folder' };
}

module.exports = { listArchiveEntries, readArchiveEntry, listDirectoryEntries, listZipEntries, listTarEntries };
