'use strict';

const { app, BrowserWindow, ipcMain, dialog, shell, Menu, nativeImage, Notification, globalShortcut } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const fsp = fs.promises;
const crypto = require('node:crypto');
const os = require('node:os');

function bootstrapDesktopRoot() {
  // Development/QA instances never read or change the real desktop workspace.
  if (!app.isPackaged && process.env.VELORIA_DEV_DATA_ROOT && path.isAbsolute(process.env.VELORIA_DEV_DATA_ROOT)) return path.resolve(process.env.VELORIA_DEV_DATA_ROOT);
  const home = process.env.USERPROFILE || os.homedir();
  let registryDesktop = '';
  if (process.platform === 'win32') {
    try {
      const { execFileSync } = require('node:child_process');
      const out = execFileSync('reg.exe', ['query', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\User Shell Folders', '/v', 'Desktop'], { encoding: 'utf8', windowsHide: true });
      const m = String(out || '').match(/Desktop\s+REG_(?:EXPAND_)?SZ\s+(.+)$/mi);
      if (m) registryDesktop = m[1].trim().replace(/%([^%]+)%/g, (_x, k) => process.env[k] || _x);
    } catch {}
  }
  const candidates = [
    registryDesktop,
    home ? path.join(home, 'Desktop') : '',
    process.env.OneDrive ? path.join(process.env.OneDrive, 'Desktop') : '',
    process.env.OneDriveConsumer ? path.join(process.env.OneDriveConsumer, 'Desktop') : ''
  ].filter(Boolean);
  const desktop = candidates.find((p) => { try { return fs.existsSync(p); } catch { return false; } }) || candidates[0] || home;
  return path.join(desktop, 'Veloria Dosyalar');
}

const BOOTSTRAP_ROOT = bootstrapDesktopRoot();
const BOOTSTRAP_RECOVERY_MODE = /recovery/i.test(path.basename(process.execPath)) || process.argv.includes('--recovery');
try {
  const electronDataName = BOOTSTRAP_RECOVERY_MODE ? 'Electron-Recovery' : 'Electron';
  fs.mkdirSync(path.join(BOOTSTRAP_ROOT, '_Veloria', electronDataName), { recursive: true });
  app.setPath('userData', path.join(BOOTSTRAP_ROOT, '_Veloria', electronDataName));
} catch {}
app.setName('Veloria Notes');
const { execFile, spawn } = require('node:child_process');
const { promisify } = require('node:util');
const { pathToFileURL, fileURLToPath } = require('node:url');
const execFileAsync = promisify(execFile);
const {
  ensureDir, isInside, isInsideAny, moveSourcesToPage, copyDirectoryToPage, organizeManagedFile, pageFolderFromMeta, sanitizeSegment, uniqueDestination,
  refreshManagedIndex, removeIndexEntry, writeAtomic, hashFile, moveFile, copyFileVerified,
  findManagedRoot, replaceManagedVersion, listManagedVersions, restoreManagedVersion,
  moveManagedToTrash, listTrash, restoreTrashItem, purgeTrash
} = require('./file-service');
const { listArchiveEntries, readArchiveEntry, listDirectoryEntries } = require('./archive-service');

let mainWindow = null;
let config = null;
let configPath = null;
let indexPath = null;
let isQuitting = false;
let rendererReady = false;
let quickWindow = null;
let trashIndexPath = null;
let appBackupDir = null;
const pendingImports = new Map();
const pendingRendererEvents = [];
const transferControls = new Map();
const saveQueues = new Map();
function queueSave(key,task) {
  const operation=(saveQueues.get(key)||Promise.resolve()).catch(()=>{}).then(task);
  saveQueues.set(key,operation);
  operation.finally(()=>{if(saveQueues.get(key)===operation)saveQueues.delete(key)}).catch(()=>{});
  return operation;
}
const recoveryMode = BOOTSTRAP_RECOVERY_MODE;

function defaultRoot() {
  return BOOTSTRAP_ROOT;
}

function systemRoot() { return path.join(defaultRoot(), '_Veloria'); }
function legacyUserDataRoot() { return !app.isPackaged && process.env.VELORIA_DEV_DATA_ROOT ? '' : process.env.APPDATA ? path.join(process.env.APPDATA, 'Veloria') : ''; }
function dataPaths() {
  const base = path.join(systemRoot(), 'local-data');
  return {
    base,
    data: path.join(base, 'veloria-state.json'),
    backups: path.join(base, 'backups'),
    ui: path.join(base, 'ui-state.json'),
    drafts: path.join(base, 'drafts')
  };
}

async function migrateLegacyLocalData() {
  const legacy = legacyUserDataRoot();
  if (!legacy || path.resolve(legacy) === path.resolve(app.getPath('userData')) || !fs.existsSync(legacy)) return;
  const p = dataPaths();
  await ensureDir(p.base);
  const candidates = [
    [path.join(legacy, 'local-data', 'veloria-state.json'), p.data],
    [path.join(legacy, 'veloria-file-index.json'), indexPath],
    [path.join(legacy, 'veloria-trash-index.json'), trashIndexPath]
  ];
  for (const [src, dst] of candidates) {
    if (!fs.existsSync(dst) && fs.existsSync(src)) { try { await ensureDir(path.dirname(dst)); await fsp.copyFile(src, dst); } catch {} }
  }
  // Keep the old data as a recovery source after migration.
}

async function loadConfig() {
  const root = defaultRoot();
  await ensureDir(root);
  await ensureDir(systemRoot());
  configPath = path.join(systemRoot(), 'veloria-native.json');
  indexPath = path.join(systemRoot(), 'veloria-file-index.json');
  trashIndexPath = path.join(systemRoot(), 'veloria-trash-index.json');
  appBackupDir = path.join(systemRoot(), 'app-backups');
  let parsed = null;
  try { parsed = JSON.parse(await fsp.readFile(configPath, 'utf8')); } catch {}
  if (!parsed) {
    const legacyCfg = legacyUserDataRoot() ? path.join(legacyUserDataRoot(), 'veloria-native.json') : '';
    try { parsed = JSON.parse(await fsp.readFile(legacyCfg, 'utf8')); } catch {}
  }
  const old = parsed && typeof parsed === 'object' ? parsed : {};
  config = {
    currentRoot: root,
    legacyRoots: [],
    storageRoots: [],
    trashRetentionDays: Math.max(1, Number(old.trashRetentionDays) || 30),
    globalQuickCapture: old.globalQuickCapture !== false,
    windowBounds: old.windowBounds && typeof old.windowBounds === 'object' ? old.windowBounds : null,
    noteFiles: old.noteFiles && typeof old.noteFiles === 'object' ? old.noteFiles : {},
    lock: old.lock && old.lock.salt && old.lock.hash ? old.lock : undefined
  };
  await ensureDir(config.currentRoot);
  await ensureDir(appBackupDir);
  await ensureDir(dataPaths().base);
  await ensureDir(dataPaths().backups);
  await ensureDir(dataPaths().drafts);
  await migrateLegacyLocalData();
  await migrateLegacyStateBackup();
  await saveConfig();
  refreshManagedIndex({ roots: managedRoots(), indexPath }).catch((e) => console.warn('Veloria file index refresh:', e));
  purgeTrash({ trashIndexPath, olderThanDays: config.trashRetentionDays }).catch((e) => console.warn('Veloria trash purge:', e));
}

async function saveConfig() {
  await ensureDir(path.dirname(configPath));
  await writeAtomic(configPath, JSON.stringify(config, null, 2));
}

function managedRoots() { return [path.resolve(config.currentRoot)]; }

async function v67ScanManagedDirectories() {
  const out = [];
  for (const root of storageRootsInfo()) {
    const base = path.resolve(root.path);
    const stack = [{ dir: base, rel: '' }];
    while (stack.length) {
      const cur = stack.pop();
      let entries = [];
      try { entries = await fsp.readdir(cur.dir, { withFileTypes: true }); } catch { continue; }
      for (const ent of entries) {
        if (!ent.isDirectory() || ent.name === '_Veloria' || ent.name === '.veloria_versions') continue;
        const full = path.join(cur.dir, ent.name);
        const rel = cur.rel ? path.join(cur.rel, ent.name) : ent.name;
        out.push({ nativePath: full, relativePath: rel, name: ent.name, rootId: root.id, rootPath: base });
        if (out.length < 25000) stack.push({ dir: full, rel });
      }
    }
  }
  return out;
}

function storageRootsInfo() { return [{ id: 'primary', label: 'Yerel depolama', path: config.currentRoot, type: 'primary' }]; }

function rootForMeta(_meta = {}) { return config.currentRoot; }


function v67UniqueTarget(target) {
  const dir = path.dirname(target);
  const ext = path.extname(target);
  const base = path.basename(target, ext);
  let i = 2;
  let candidate = target;
  while (fs.existsSync(candidate)) candidate = path.join(dir, `${base} (${i++})${ext}`);
  return candidate;
}

async function v67ResolveConflictTarget(target, mode = 'error') {
  let out = path.resolve(target);
  if (!fs.existsSync(out)) return { target: out, skipped: false };
  if (mode === 'skip') return { target: out, skipped: true };
  if (mode === 'keepBoth') return { target: v67UniqueTarget(out), skipped: false };
  if (mode === 'overwrite') {
    const st = await fsp.stat(out).catch(() => null);
    if (st?.isDirectory()) throw new Error('Hedefte ayni isimli bir klasor var.');
    await fsp.rm(out, { force: true });
    return { target: out, skipped: false };
  }
  throw new Error('Hedefte ayni isimli bir dosya zaten var.');
}

function assertManaged(target) {
  const p = path.resolve(String(target || ''));
  const roots = managedRoots();
  if (!isInsideAny(roots, p)) throw new Error('Bu dosya Veloria tarafından yönetilen klasörlerden birinde değil.');
  for (const root of roots) {
    if (!root) continue;
    const rel = path.relative(path.resolve(root), p);
    const relCmp = process.platform === 'win32' ? rel.toLowerCase() : rel;
    const systemName = process.platform === 'win32' ? '_veloria' : '_Veloria';
    if (relCmp === systemName || relCmp.startsWith(systemName + path.sep)) throw new Error('Veloria sistem/yedek klasörü dosya işlemlerine kapalı.');
  }
  return p;
}

async function migrateLegacyStateBackup() {
  const target = dataPaths().data;
  if (fs.existsSync(target)) return;
  const candidates = [
    path.join(defaultRoot(), '_Veloria', 'data', 'veloria-state.json'),
    legacyUserDataRoot() ? path.join(legacyUserDataRoot(), 'local-data', 'veloria-state.json') : ''
  ].filter(Boolean);
  for (const legacy of candidates) {
    if (!fs.existsSync(legacy)) continue;
    try {
      const text = await fsp.readFile(legacy, 'utf8'); JSON.parse(text); await writeAtomic(target, text);
      const oldDataDir = path.join(defaultRoot(), '_Veloria', 'data');
      if (path.resolve(legacy).startsWith(path.resolve(oldDataDir))) { try { await fsp.rm(oldDataDir, { recursive: true, force: true }); } catch {} }
      return;
    } catch {}
  }
}


function sendProgress(sender, payload) {
  if (!sender || sender.isDestroyed()) return;
  sender.send('veloria:file-progress', payload);
}

function emitToRenderer(channel, payload) {
  if (rendererReady && mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  } else {
    pendingRendererEvents.push({ channel, payload });
  }
}

function flushRendererEvents() {
  if (!rendererReady || !mainWindow || mainWindow.isDestroyed()) return;
  while (pendingRendererEvents.length) {
    const ev = pendingRendererEvents.shift();
    mainWindow.webContents.send(ev.channel, ev.payload);
  }
}

function createTransferControl(transferId) {
  let paused = false;
  let cancelled = false;
  let waiters = [];
  const control = {
    transferId,
    get paused() { return paused; },
    get cancelled() { return cancelled; },
    pause() { paused = true; },
    resume() { paused = false; const list = waiters.splice(0); for (const r of list) r(); },
    cancel() { cancelled = true; paused = false; const list = waiters.splice(0); for (const r of list) r(); },
    async waitIfPaused() {
      while (paused && !cancelled) await new Promise((resolve) => waiters.push(resolve));
      if (cancelled) { const e = new Error('Aktarım iptal edildi.'); e.code = 'VELORIA_CANCELLED'; throw e; }
    }
  };
  transferControls.set(transferId, control);
  return control;
}

function newTransferId() { return crypto.randomBytes(10).toString('hex'); }
function transferProgress(sender, transferId, payload) { sendProgress(sender, { ...payload, transferId }); }

async function withTransfer(sender, work) {
  const transferId = newTransferId();
  const control = createTransferControl(transferId);
  try {
    const result = await work(control, transferId);
    if (control.cancelled) {
      transferProgress(sender, transferId, { status: 'cancelled', terminal: true, finishedAt: Date.now() });
      return { transferId, ...result, transferCancelled: true };
    }
    const hardErrors = Array.isArray(result && result.errors) ? result.errors.filter((x) => x && !x.warning) : [];
    if (hardErrors.length) {
      transferProgress(sender, transferId, { status: 'error', terminal: true, error: hardErrors[0].error || hardErrors[0].name || 'Dosya işlemi başarısız.', finishedAt: Date.now() });
    } else {
      transferProgress(sender, transferId, { status: 'completed', terminal: true, percent: 100, finishedAt: Date.now() });
    }
    return { transferId, ...result };
  } catch (err) {
    const cancelled = control.cancelled || (err && err.code === 'VELORIA_CANCELLED');
    transferProgress(sender, transferId, { status: cancelled ? 'cancelled' : 'error', terminal: true, error: cancelled ? '' : (err && err.message ? err.message : 'Dosya işlemi başarısız.'), finishedAt: Date.now() });
    throw err;
  } finally { transferControls.delete(transferId); }
}

async function chooseAndMove(event, meta = {}) {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: meta.importMode === 'copy' ? 'Veloria notuna kopyalanacak dosyalari sec' : 'Veloria notuna tasinacak dosyalari sec',
    properties: ['openFile', 'multiSelections']
  });
  if (result.canceled || !result.filePaths.length) return { canceled: true, files: [] };
  const selectedRoot = rootForMeta(meta);
  return withTransfer(event.sender, async (control, transferId) => {
    const moved = await moveSourcesToPage({
      sources: result.filePaths,
      root: selectedRoot,
      roots: managedRoots(),
      indexPath,
      meta,
      control,
      onProgress: (p) => transferProgress(event.sender, transferId, { ...p, blockId: meta && meta.blockId })
    });
    return { canceled: false, rootPath: selectedRoot, ...moved };
  });
}

async function moveDropped(event, payload) {
  const paths = Array.isArray(payload && payload.paths) ? payload.paths : [];
  if (!paths.length) return { canceled: true, files: [] };
  const meta = payload.meta || {};
  const selectedRoot = rootForMeta(meta);
  return withTransfer(event.sender, async (control, transferId) => {
    const moved = await moveSourcesToPage({
      sources: paths,
      root: selectedRoot,
      roots: managedRoots(),
      indexPath,
      meta,
      control,
      onProgress: (p) => transferProgress(event.sender, transferId, { ...p, blockId: meta.blockId })
    });
    return { canceled: false, rootPath: selectedRoot, ...moved };
  });
}


async function importDroppedCopy(event, payload = {}) {
  const rawPaths = Array.isArray(payload.paths) ? payload.paths : [];
  const rawBuffers = Array.isArray(payload.buffers) ? payload.buffers : [];
  const fileSources = [];
  const directorySources = [];
  const tempFiles = [];
  const seenSourcePaths = new Set();
  const seenBufferHashes = new Set();
  const maxInlineBytes = 64 * 1024 * 1024;
  const maxTotalInlineBytes = 128 * 1024 * 1024;
  let totalInlineBytes = 0;

  for (const value of rawPaths) {
    try {
      const resolved = path.resolve(String(value || ''));
      if (!resolved || !fs.existsSync(resolved)) continue;
      const sourceKey = process.platform === 'win32' ? resolved.toLowerCase() : resolved;
      if (seenSourcePaths.has(sourceKey)) continue;
      seenSourcePaths.add(sourceKey);
      const st = await fsp.stat(resolved);
      if (st.isDirectory()) directorySources.push(resolved);
      else if (st.isFile()) fileSources.push(resolved);
    } catch {}
  }

  try {
    const tempRoot = path.join(app.getPath('temp'), 'veloria-drop-cache');
    if (rawBuffers.length) await ensureDir(tempRoot);
    for (let i = 0; i < rawBuffers.length; i++) {
      const item = rawBuffers[i] || {};
      let buf;
      try {
        if (Buffer.isBuffer(item.data)) buf = item.data;
        else if (ArrayBuffer.isView(item.data)) buf = Buffer.from(item.data.buffer, item.data.byteOffset, item.data.byteLength);
        else if (item.data instanceof ArrayBuffer) buf = Buffer.from(item.data);
      } catch {}
      if (!buf || !buf.length) continue;
      const bufferHash = crypto.createHash('sha256').update(buf).digest('hex');
      if (seenBufferHashes.has(bufferHash)) continue;
      seenBufferHashes.add(bufferHash);
      if (buf.length > maxInlineBytes) throw new Error('Sürüklenen/yapıştırılan tek dosya 64 MB sınırını aşıyor. Dosyayı Windows Gezgini üzerinden sürükle.');
      totalInlineBytes += buf.length;
      if (totalInlineBytes > maxTotalInlineBytes) throw new Error('Sürüklenen/yapıştırılan bellek dosyaları toplam 128 MB sınırını aşıyor.');
      const original = path.basename(String(item.name || `dosya-${i + 1}`)).replace(/[<>:"/\\|?*\x00-\x1F]/g, '_') || `dosya-${i + 1}`;
      const tempPath = path.join(tempRoot, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}-${original}`);
      await fsp.writeFile(tempPath, buf, { flag: 'wx' });
      tempFiles.push(tempPath);
      fileSources.push(tempPath);
    }

    if (!fileSources.length && !directorySources.length) return { canceled: true, files: [], errors: [] };
    const meta = { ...(payload.meta || {}), importMode: 'copy', forcePhysicalCopy: true };
    const selectedRoot = rootForMeta(meta);
    return await withTransfer(event.sender, async (control, transferId) => {
      const result = fileSources.length ? await moveSourcesToPage({
        sources: fileSources,
        root: selectedRoot,
        roots: managedRoots(),
        indexPath,
        meta,
        control,
        onProgress: (p) => transferProgress(event.sender, transferId, { ...p, blockId: meta.blockId })
      }) : { files: [], errors: [], pageFolderRel: pageFolderFromMeta(meta), importMode: 'copy' };
      const folderResults = [];
      const folderErrors = [];
      for (let i = 0; i < directorySources.length; i++) {
        const source = directorySources[i];
        try {
          const folder = await copyDirectoryToPage({
            source,
            root: selectedRoot,
            roots: managedRoots(),
            indexPath,
            meta,
            control,
            onProgress: (p) => transferProgress(event.sender, transferId, { ...p, blockId: meta.blockId, token: `${meta.blockId || 'folder'}:dir:${i}` })
          });
          folderResults.push(folder);
        } catch (e) { folderErrors.push({ name: path.basename(source), error: e && e.message ? e.message : 'Klasor kopyalanamadi' }); }
      }
      return { canceled: false, rootPath: selectedRoot, files: [...(result.files || []), ...folderResults], errors: [...(result.errors || []), ...folderErrors], pageFolderRel: result.pageFolderRel || pageFolderFromMeta(meta), importMode: 'copy' };
    });
  } finally {
    await Promise.all(tempFiles.map((f) => fsp.rm(f, { force: true }).catch(() => {})));
  }
}

async function acceptPendingImport(event, payload = {}) {
  const token = String(payload.token || '');
  const entry = pendingImports.get(token);
  if (!entry) throw new Error('Bekleyen Windows dosya aktarımı bulunamadı.');
  pendingImports.delete(token);
  const meta = payload.meta || {};
  const selectedRoot = rootForMeta(meta);
  return withTransfer(event.sender, async (control, transferId) => {
    const moved = await moveSourcesToPage({
      sources: entry.paths,
      root: selectedRoot,
      roots: managedRoots(),
      indexPath,
      meta,
      control,
      onProgress: (p) => transferProgress(event.sender, transferId, { ...p, blockId: meta.blockId })
    });
    return { canceled: false, rootPath: selectedRoot, ...moved };
  });
}

function queueImport(paths, mode = 'choose') {
  const clean = [...new Set((paths || []).map((p) => path.resolve(String(p || ''))).filter((p) => fs.existsSync(p)))];
  if (!clean.length) return;
  const token = crypto.randomBytes(12).toString('hex');
  pendingImports.set(token, { paths: clean, createdAt: Date.now(), mode });
  for (const [key, value] of pendingImports) if (Date.now() - value.createdAt > 30 * 60 * 1000) pendingImports.delete(key);
  showMainWindow();
  emitToRenderer('veloria:import-request', { token, names: clean.map((p) => path.basename(p)), count: clean.length, mode });
}

function parseLaunchArgs(argv = []) {
  const imports = [], newNotes = [], lastNotes = [], categories = [], showFiles = [];
  let deepLink = '';
  for (let i = 0; i < argv.length; i++) {
    const arg = String(argv[i] || '');
    if (arg === '--veloria-import' && argv[i + 1]) imports.push(String(argv[++i]));
    else if (arg === '--veloria-new-note' && argv[i + 1]) newNotes.push(String(argv[++i]));
    else if (arg === '--veloria-last-note' && argv[i + 1]) lastNotes.push(String(argv[++i]));
    else if (arg === '--veloria-category' && argv[i + 1]) categories.push(String(argv[++i]));
    else if (arg === '--veloria-show' && argv[i + 1]) showFiles.push(String(argv[++i]));
    else if (/^veloria:\/\//i.test(arg)) deepLink = arg;
  }
  if (imports.length) queueImport(imports, 'choose');
  if (newNotes.length) queueImport(newNotes, 'new-note');
  if (lastNotes.length) queueImport(lastNotes, 'last-note');
  if (categories.length) queueImport(categories, 'category');
  for (const filePath of showFiles) { const p = path.resolve(filePath); showMainWindow(); emitToRenderer('veloria:show-file', { path: p, name: path.basename(p) }); }
  if (deepLink) handleDeepLink(deepLink);
}

function handleDeepLink(raw) {
  try {
    const u = new URL(raw);
    let pageId = '';
    if (u.hostname.toLowerCase() === 'note') pageId = decodeURIComponent(u.pathname.replace(/^\/+/, ''));
    if (!pageId) {
      const parts = [u.hostname, ...u.pathname.split('/').filter(Boolean)];
      const i = parts.findIndex((x) => x.toLowerCase() === 'note');
      if (i >= 0) pageId = decodeURIComponent(parts[i + 1] || '');
    }
    if (pageId) {
      showMainWindow();
      emitToRenderer('veloria:navigate', { pageId });
    }
  } catch {}
}


async function savePageText(payload = {}) {
  const pageId = String(payload.pageId || '').trim();
  if (!pageId) throw new Error('Sayfa kimliği eksik.');
  const root = rootForMeta(payload);
  const folderRel = pageFolderFromMeta(payload);
  const dir = path.join(root, folderRel);
  if (!isInsideAny([root], dir)) throw new Error('Geçersiz sayfa klasörü.');
  await ensureDir(dir);
  const baseName = sanitizeSegment(payload.pageTitle || 'Not', 'Not');
  let target = path.join(dir, `${baseName}.txt`);
  const previous = config.noteFiles?.[pageId] ? path.resolve(config.noteFiles[pageId]) : '';
  // Existing notes keep their physical paths, including the legacy Dosyalar layout.
  if (previous && isInside(root, previous) &&
      [dir, path.join(dir, 'Dosyalar')].some(p => samePath(p, path.dirname(previous)))) target = previous;
  if (fs.existsSync(target) && (!previous || !samePath(previous, target))) target = await uniqueDestination(dir, `${baseName}.txt`);
  if (previous && previous !== path.resolve(target) && fs.existsSync(previous) && isInsideAny(managedRoots(), previous)) {
    try {
      if (!fs.existsSync(target)) {
        await ensureDir(path.dirname(target));
        await fsp.rename(previous, target).catch(async (err) => {
          if (err && err.code === 'EXDEV') { await fsp.copyFile(previous, target); await fsp.unlink(previous); }
          else throw err;
        });
      } else {
        await fsp.rm(previous, { force: true }).catch(() => {});
      }
    } catch (e) { console.warn('Veloria note txt relocate:', e); }
  }
  const text = String(payload.text || '');
  if (Buffer.byteLength(text, 'utf8') > 20 * 1024 * 1024) throw new Error('Not TXT dosyası 20 MB sınırını aştı.');
  await writeAtomic(target, text);
  config.noteFiles[pageId] = target;
  await saveConfig();
  return { ok: true, path: target, relativePath: path.relative(root, target) };
}


async function pruneDeletedNoteContainers(filePath) {
  const p = path.resolve(String(filePath || ''));
  const roots = managedRoots().map((x) => path.resolve(x));
  if (!isInsideAny(roots, p)) return;
  const dirs = [path.dirname(p)];
  if (path.basename(dirs[0]).toLocaleLowerCase('tr') === 'dosyalar') dirs.push(path.dirname(dirs[0]));
  for (const dir of dirs) {
    if (!isInsideAny(roots, dir) || roots.some((root) => root === path.resolve(dir))) break;
    try {
      const entries = await fsp.readdir(dir);
      if (entries.length) break;
      await fsp.rmdir(dir);
    } catch (err) {
      if (err?.code === 'ENOENT') continue;
      if (err?.code === 'ENOTEMPTY') break;
      throw err;
    }
  }
}

function isManagedNoteTextPath(filePath) {
  const candidate = path.resolve(String(filePath || ''));
  if (!candidate || path.extname(candidate).toLowerCase() !== '.txt') return false;
  for (const rootRaw of managedRoots()) {
    const root = path.resolve(rootRaw);
    if (!isInsideAny([root], candidate)) continue;
    const rel = path.relative(root, candidate);
    const parts = rel.split(path.sep).filter(Boolean);
    if (!parts.length || String(parts[0]).toLowerCase() === '_veloria') return false;
    return Object.values(config.noteFiles || {}).some(p => samePath(p, candidate));
  }
  return false;
}

async function deletePageTextEntry(pageId, fallbackPath = '') {
  const id = String(pageId || '').trim();
  if (!id) throw new Error('Sayfa kimliği eksik.');
  config.noteFiles = config.noteFiles && typeof config.noteFiles === 'object' ? config.noteFiles : {};
  const mapped = config.noteFiles[id] ? path.resolve(config.noteFiles[id]) : '';
  const fallback = fallbackPath ? path.resolve(String(fallbackPath)) : '';
  const candidates = [...new Set([mapped, fallback].filter(Boolean))];
  let removed = false;
  for (const candidate of candidates) {
    if (!isManagedNoteTextPath(candidate)) continue;
    try {
      await fsp.rm(candidate, { force: true });
      await removeIndexEntry(indexPath, candidate).catch(() => {});
      await pruneDeletedNoteContainers(candidate).catch((e) => console.warn('Veloria note folder prune:', e));
      removed = true;
    } catch (e) {
      if (e?.code !== 'ENOENT') throw e;
    }
  }
  delete config.noteFiles[id];
  return { pageId: id, removed };
}

async function deletePageTexts(items = []) {
  const result = { ok: true, removed: [], errors: [] };
  for (const item of Array.isArray(items) ? items : []) {
    const pageId = String(item?.pageId || '').trim();
    if (!pageId) continue;
    try { result.removed.push(await deletePageTextEntry(pageId, item?.filePath || '')); }
    catch (e) { result.ok = false; result.errors.push({ pageId, error: e?.message || String(e) }); }
  }
  await saveConfig();
  return result;
}

async function reconcilePageTexts(validPageIds = []) {
  config.noteFiles = config.noteFiles && typeof config.noteFiles === 'object' ? config.noteFiles : {};
  const valid = new Set((Array.isArray(validPageIds) ? validPageIds : []).map((x) => String(x || '').trim()).filter(Boolean));
  const stale = Object.keys(config.noteFiles).filter((id) => !valid.has(id));
  const result = await deletePageTexts(stale.map((pageId) => ({ pageId })));
  return { ...result, checked: Object.keys(config.noteFiles).length + stale.length, stale: stale.length };
}

async function readManagedText(filePath) {
  const p = assertManaged(filePath);
  const st = await fsp.stat(p);
  if (!st.isFile()) throw new Error('Yalnızca dosya açılabilir.');
  if (st.size > 20 * 1024 * 1024) throw new Error('Metin editörü 20 MB altındaki dosyalar içindir.');
  const text = await fsp.readFile(p, 'utf8');
  return { ok: true, text, path: p, name: path.basename(p), size: st.size, mtimeMs: st.mtimeMs };
}

async function writeManagedText(filePath, text) {
  const p = assertManaged(filePath);
  const data = String(text || '');
  if (Buffer.byteLength(data, 'utf8') > 20 * 1024 * 1024) throw new Error('Metin editörü 20 MB altındaki dosyalar içindir.');
  await writeAtomic(p, data);
  const st = await fsp.stat(p);
  await refreshManagedIndex({ roots: managedRoots(), indexPath });
  return { ok: true, path: p, size: st.size, mtimeMs: st.mtimeMs };
}

async function saveState(text) {
  if (typeof text !== 'string' || text.length > 60 * 1024 * 1024) throw new Error('Yerel veri beklenenden büyük.');
  JSON.parse(text);
  const p = dataPaths();
  await writeAtomic(p.data, text);
  const day = new Date().toISOString().slice(0, 10);
  await ensureDir(p.backups);
  const daily = path.join(p.backups, `veloria-state-${day}.json`);
  if (!fs.existsSync(daily)) await writeAtomic(daily, text);
  const entries = (await fsp.readdir(p.backups, { withFileTypes: true }))
    .filter((x) => x.isFile() && /^veloria-state-\d{4}-\d{2}-\d{2}\.json$/.test(x.name))
    .map((x) => x.name)
    .sort()
    .reverse();
  for (const old of entries.slice(30)) await fsp.rm(path.join(p.backups, old), { force: true });
  return { ok: true, path: p.data };
}

async function readState() {
  const p = dataPaths().data;
  try {
    const text = await fsp.readFile(p, 'utf8');
    JSON.parse(text);
    return { ok: true, text, path: p };
  } catch (err) {
    if (err && err.code === 'ENOENT') return { ok: false, missing: true, path: p };
    throw err;
  }
}

async function saveUiState(text) {
  const raw = String(text || '{}');
  if (Buffer.byteLength(raw, 'utf8') > 2 * 1024 * 1024) throw new Error('Arayüz ayarları beklenenden büyük.');
  JSON.parse(raw);
  await writeAtomic(dataPaths().ui, raw);
  return { ok: true };
}
async function readUiState() {
  try { const text = await fsp.readFile(dataPaths().ui, 'utf8'); JSON.parse(text); return { ok: true, text }; }
  catch (err) { if (err?.code === 'ENOENT') return { ok: false, missing: true }; throw err; }
}
function draftFile(key) { return path.join(dataPaths().drafts, crypto.createHash('sha256').update(String(key || '')).digest('hex') + '.json'); }
async function saveDraft(key, text) {
  await ensureDir(dataPaths().drafts);
  const payload = JSON.stringify({ key: String(key || ''), at: Date.now(), text: String(text || '') });
  if (Buffer.byteLength(payload, 'utf8') > 24 * 1024 * 1024) throw new Error('Taslak çok büyük.');
  await writeAtomic(draftFile(key), payload); return { ok: true };
}
async function readDraft(key) {
  try { const raw = JSON.parse(await fsp.readFile(draftFile(key), 'utf8')); return { ok: true, ...raw }; }
  catch (err) { if (err?.code === 'ENOENT') return { ok: false, missing: true }; return { ok: false, invalid: true }; }
}
async function deleteDraft(key) { try { await fsp.rm(draftFile(key), { force: true }); } catch {} return { ok: true }; }

async function copyTree(source, destination) {
  if (!fs.existsSync(source)) return;
  const st = await fsp.stat(source);
  if (st.isDirectory()) {
    await ensureDir(destination);
    for (const name of await fsp.readdir(source)) await copyTree(path.join(source, name), path.join(destination, name));
  } else if (st.isFile()) {
    await ensureDir(path.dirname(destination));
    await fsp.copyFile(source, destination);
  }
}

async function exportRecovery() {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Veloria Notes kurtarma paketinin kaydedileceği klasörü seç',
    properties: ['openDirectory', 'createDirectory']
  });
  if (result.canceled || !result.filePaths[0]) return { canceled: true };
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const out = path.join(result.filePaths[0], `Veloria-Kurtarma-${stamp}`);
  await ensureDir(out);
  const p = dataPaths();
  await copyTree(p.data, path.join(out, 'veloria-state.json'));
  await copyTree(p.backups, path.join(out, 'backups'));
  await copyTree(configPath, path.join(out, 'veloria-native.json'));
  await copyTree(indexPath, path.join(out, 'veloria-file-index.json'));
  const info = [
    'Veloria Windows Desktop Kurtarma Paketi',
    `Olusturulma: ${new Date().toLocaleString('tr-TR')}`,
    `Aktif dosya klasoru: ${config.currentRoot}`,
    `Eski dosya klasorleri: ${(config.legacyRoots || []).join(' | ') || '-'}`,
    '',
    'Bu kurtarma paketi not/veri yapisini icerir. Buyuk fiziksel dosyalar kopyalanmadi; yukaridaki Veloria Dosyalar klasorunde kalir.'
  ].join('\r\n');
  await fsp.writeFile(path.join(out, 'KURTARMA_BILGISI.txt'), info, 'utf8');
  shell.openPath(out).catch(() => {});
  return { canceled: false, path: out };
}

function pinHash(pin, salt) {
  return crypto.scryptSync(String(pin), Buffer.from(salt, 'hex'), 32).toString('hex');
}

function lockStatus() {
  return { enabled: !!(config.lock && config.lock.salt && config.lock.hash) };
}

async function setPin(pin) {
  const text = String(pin || '');
  if (!text) {
    delete config.lock;
    await saveConfig();
    return { enabled: false };
  }
  if (text.length < 4) throw new Error('Uygulama şifresi en az 4 karakter olmalı.');
  const salt = crypto.randomBytes(16).toString('hex');
  config.lock = { salt, hash: pinHash(text, salt), updatedAt: new Date().toISOString() };
  await saveConfig();
  return { enabled: true };
}

function verifyPin(pin) {
  if (!lockStatus().enabled) return true;
  try {
    const actual = Buffer.from(pinHash(String(pin || ''), config.lock.salt), 'hex');
    const expected = Buffer.from(config.lock.hash, 'hex');
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  } catch { return false; }
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}


function createQuickWindow() {
  if (quickWindow && !quickWindow.isDestroyed()) { quickWindow.show(); quickWindow.focus(); return; }
  quickWindow = new BrowserWindow({
    width: 520, height: 330, resizable: false, maximizable: false, minimizable: false,
    alwaysOnTop: true, show: false, frame: true, title: 'Veloria Notes - Hızlı Not',
    backgroundColor: '#0f172a', icon: path.join(__dirname, 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'quick-preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, partition: 'veloria-memory' }
  });
  quickWindow.removeMenu();
  quickWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  quickWindow.webContents.on('will-navigate', (event, url) => {
    const local = rendererFileFromUrl(url);
    if (local && samePath(local, path.join(__dirname, 'quick-capture.html'))) return;
    event.preventDefault();
  });
  quickWindow.once('ready-to-show', () => quickWindow.show());
  quickWindow.on('closed', () => { quickWindow = null; });
  quickWindow.loadFile(path.join(__dirname, 'quick-capture.html'));
}

function registerGlobalShortcuts() {
  globalShortcut.unregisterAll();
  if (!config.globalQuickCapture || recoveryMode) return;
  try { globalShortcut.register('CommandOrControl+Alt+V', () => createQuickWindow()); } catch {}
  try { globalShortcut.register('CommandOrControl+Alt+L', () => { showMainWindow(); emitToRenderer('veloria:lock-request', {}); }); } catch {}
}


async function ensureWindowsShellIntegration() {
  if (process.platform !== 'win32' || !app.isPackaged) return;
  const exe = process.execPath;
  const entries = [
    ['HKCU\\Software\\Classes\\*\\shell\\VeloriaMove', '/ve', "Veloria Notes'a Taşı"],
    ['HKCU\\Software\\Classes\\*\\shell\\VeloriaMove', '/v', 'Icon', '/d', exe],
    ['HKCU\\Software\\Classes\\*\\shell\\VeloriaMove\\command', '/ve', `"${exe}" --veloria-import "%1"`],
    ['HKCU\\Software\\Classes\\*\\shell\\VeloriaNewNote', '/ve', "Veloria Notes'ta Yeni Sayfa Oluştur"],
    ['HKCU\\Software\\Classes\\*\\shell\\VeloriaNewNote', '/v', 'Icon', '/d', exe],
    ['HKCU\\Software\\Classes\\*\\shell\\VeloriaNewNote\\command', '/ve', `"${exe}" --veloria-new-note "%1"`],
    ['HKCU\\Software\\Classes\\*\\shell\\VeloriaShow', '/ve', "Veloria Notes'ta Göster"],
    ['HKCU\\Software\\Classes\\*\\shell\\VeloriaShow', '/v', 'Icon', '/d', exe],
    ['HKCU\\Software\\Classes\\*\\shell\\VeloriaShow\\command', '/ve', `"${exe}" --veloria-show "%1"`]
  ];
  for (const entry of entries) {
    const key = entry[0];
    let args;
    if (entry[1] === '/ve') args = ['add', key, '/ve', '/d', entry[2], '/f'];
    else args = ['add', key, '/v', entry[2], '/d', entry[4], '/f'];
    try { await execFileAsync('reg.exe', args, { windowsHide: true }); } catch (error) { console.warn('Veloria Notes Windows entegrasyonu:', error?.message || error); }
  }
}

function archivePreviewRoot() { return path.join(os.tmpdir(), 'Veloria-Notes-Archive-Preview'); }
function isInsidePath(root, target) {
  return isInside(root, target);
}

function assertArchiveSource(target) {
  const p = path.resolve(String(target || ''));
  try { return assertManaged(p); } catch (managedErr) {
    if (isInsidePath(archivePreviewRoot(), p)) return p;
    throw managedErr;
  }
}
function imageDrawingRoot() { return path.join(dataPaths().base, 'image-drawings'); }
function imageDrawingPath(filePath) {
  const resolved = path.resolve(String(filePath || ''));
  const keySource = process.platform === 'win32' ? resolved.toLowerCase() : resolved;
  const key = crypto.createHash('sha256').update(keySource).digest('hex');
  return path.join(imageDrawingRoot(), `${key}.png`);
}
function versionedFileUrl(filePath, mtimeMs = Date.now()) {
  const u = pathToFileURL(filePath);
  u.searchParams.set('v', String(Math.round(Number(mtimeMs) || Date.now())));
  return u.href;
}
async function imageDrawingUrlFor(filePath) {
  if (!config || !isInsideAny(managedRoots(), filePath)) return '';
  const drawing = imageDrawingPath(filePath);
  try {
    const st = await fsp.stat(drawing);
    if (!st.isFile()) return '';
    return versionedFileUrl(drawing, st.mtimeMs);
  } catch { return ''; }
}
async function saveImageDrawing(payload = {}) {
  const source = assertManaged(payload.filePath);
  const ext = path.extname(source).toLowerCase();
  if (!['.png','.jpg','.jpeg','.gif','.webp','.svg','.bmp','.ico','.avif'].includes(ext)) throw new Error('Bu dosya bir görsel değil.');
  let buf = null;
  const raw = payload.data;
  try {
    if (Buffer.isBuffer(raw)) buf = raw;
    else if (ArrayBuffer.isView(raw)) buf = Buffer.from(raw.buffer, raw.byteOffset, raw.byteLength);
    else if (raw instanceof ArrayBuffer) buf = Buffer.from(raw);
  } catch {}
  if (!buf || !buf.length) throw new Error('Çizim verisi boş.');
  if (buf.length > 48 * 1024 * 1024) throw new Error('Çizim katmanı 48 MB sınırını aşıyor.');
  const pngSig = Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]);
  if (buf.length < pngSig.length || !buf.subarray(0, pngSig.length).equals(pngSig)) throw new Error('Çizim katmanı PNG biçiminde değil.');
  const target = imageDrawingPath(source);
  await ensureDir(path.dirname(target));
  const temp = `${target}.tmp-${process.pid}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  await fsp.writeFile(temp, buf, { flag: 'wx' });
  try {
    try { await fsp.rename(temp, target); }
    catch (err) {
      if (!['EEXIST','EPERM','EACCES'].includes(err && err.code)) throw err;
      await fsp.rm(target, { force: true }).catch(() => {});
      await fsp.rename(temp, target);
    }
  } finally { await fsp.rm(temp, { force: true }).catch(() => {}); }
  const st = await fsp.stat(target);
  return { ok: true, url: versionedFileUrl(target, st.mtimeMs), size: st.size, mtimeMs: st.mtimeMs };
}

async function previewInfoForPath(p) {
  const st = await fsp.stat(p);
  if (st.isDirectory()) {
    const listed = await listDirectoryEntries(p);
    return { kind: 'folder', name: path.basename(p), size: 0, entries: listed.entries, truncated: listed.truncated };
  }
  if (!st.isFile()) throw new Error('Önizleme yalnızca dosya veya klasörü destekliyor.');
  const ext = path.extname(p).toLowerCase();
  if (['.txt','.md','.json','.jsonc','.csv','.log','.js','.mjs','.cjs','.ts','.tsx','.jsx','.css','.scss','.less','.html','.htm','.xml','.yml','.yaml','.toml','.ini','.conf','.env','.py','.java','.c','.h','.cpp','.hpp','.cs','.go','.rs','.php','.sh','.ps1'].includes(ext)) {
    const max = Math.min(st.size, 2 * 1024 * 1024);
    const h = await fsp.open(p, 'r');
    try { const b = Buffer.alloc(max); const r = await h.read(b, 0, max, 0); return { kind: 'text', name: path.basename(p), size: st.size, text: b.subarray(0, r.bytesRead).toString('utf8'), truncated: st.size > max }; }
    finally { await h.close(); }
  }
  if (['.png','.jpg','.jpeg','.gif','.webp','.svg','.bmp','.ico','.avif'].includes(ext)) return { kind: 'image', name: path.basename(p), size: st.size, url: versionedFileUrl(p, st.mtimeMs), annotationUrl: await imageDrawingUrlFor(p) };
  if (['.mp4','.webm','.mov','.m4v','.ogg'].includes(ext)) return { kind: 'video', name: path.basename(p), size: st.size, url: pathToFileURL(p).href };
  if (['.mp3','.wav','.flac','.m4a','.aac','.ogg'].includes(ext)) return { kind: 'audio', name: path.basename(p), size: st.size, url: pathToFileURL(p).href };
  if (ext === '.pdf') return { kind: 'pdf', name: path.basename(p), size: st.size, url: pathToFileURL(p).href };
  if (/\.(zip|rar|7z|tar|tgz|gz)$/i.test(p)) { try { const a = await listArchiveEntries(p); return { kind: 'archive', name: path.basename(p), size: st.size, entries: a.entries || [], truncated: !!a.truncated, format: a.format || ext.slice(1), warning: a.warning || '' }; } catch (e) { return { kind: 'archive', name: path.basename(p), size: st.size, entries: [], truncated: false, format: ext.slice(1), warning: e && e.message ? e.message : 'Arsiv onizlenemedi.' }; } }
  return { kind: 'external', name: path.basename(p), size: st.size };
}
async function previewInfo(filePath) {
  const p = assertManaged(filePath);
  try {
    return await previewInfoForPath(p);
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      return { kind: 'missing', missing: true, name: path.basename(p), size: 0 };
    }
    throw err;
  }
}
async function previewArchiveEntry(archivePath, entryPath) {
  const source = assertArchiveSource(archivePath);
  const extracted = await readArchiveEntry(source, entryPath);
  const root = archivePreviewRoot();
  await ensureDir(root);
  const st = await fsp.stat(source);
  const archiveKey = crypto.createHash('sha256').update(`${source}|${st.size}|${st.mtimeMs}`).digest('hex').slice(0, 20);
  const entryKey = crypto.createHash('sha256').update(String(entryPath || '')).digest('hex').slice(0, 16);
  const safeBase = sanitizeSegment(path.basename(extracted.name || String(entryPath || 'dosya'))) || 'dosya';
  const dir = path.join(root, archiveKey);
  await ensureDir(dir);
  const target = path.join(dir, `${entryKey}-${safeBase}`);
  await fsp.writeFile(target, extracted.data);
  const info = await previewInfoForPath(target);
  return { ...info, extractedPath: target, archivePath: source, entryPath: String(entryPath || ''), displayName: extracted.name || path.basename(String(entryPath || '')) };
}

async function chooseNewVersion(event, payload = {}) {
  const current = assertManaged(payload.filePath);
  const pick = await dialog.showOpenDialog(mainWindow, { title: 'Yeni dosya sürümünü seç', properties: ['openFile'] });
  if (pick.canceled || !pick.filePaths[0]) return { canceled: true };
  return withTransfer(event.sender, async (control, transferId) => {
    const file = await replaceManagedVersion({ filePath: current, replacementPath: pick.filePaths[0], roots: managedRoots(), indexPath, control, onProgress: (p) => transferProgress(event.sender, transferId, p) });
    return { canceled: false, file };
  });
}


async function listStateBackups() {
  const p = dataPaths(); await ensureDir(p.backups);
  const names = await fsp.readdir(p.backups).catch(() => []);
  const out = [];
  for (const name of names.filter((x) => /^veloria-state-.*\.json$/i.test(x))) {
    const full = path.join(p.backups, name);
    try { const st = await fsp.stat(full); out.push({ id: name, name, path: full, size: st.size, mtimeMs: st.mtimeMs }); } catch {}
  }
  return out.sort((a,b) => b.mtimeMs - a.mtimeMs);
}

async function restoreStateBackup(id) {
  const p = dataPaths();
  const full = path.resolve(p.backups, String(id || ''));
  if (!full.startsWith(path.resolve(p.backups) + path.sep)) throw new Error('Geçersiz yedek.');
  const text = await fsp.readFile(full, 'utf8'); JSON.parse(text);
  if (fs.existsSync(p.data)) await writeAtomic(path.join(p.backups, `veloria-state-before-restore-${Date.now()}.json`), await fsp.readFile(p.data, 'utf8'));
  await writeAtomic(p.data, text);
  return { ok: true, text };
}


function updaterScriptPath() {
  const candidates = [
    path.join(path.dirname(process.execPath), 'VELORIA_UPDATE_ENGINE.ps1'),
    path.join(process.resourcesPath || '', 'VELORIA_UPDATE_ENGINE.ps1'),
    path.join(__dirname, '..', 'VELORIA_UPDATE_ENGINE.ps1')
  ];
  return candidates.find((candidate) => candidate && fs.existsSync(candidate)) || candidates[0];
}
async function launchUpdater(mode, arg = '') {
  const script = updaterScriptPath(); if (!fs.existsSync(script)) throw new Error('Güncelleme motoru bulunamadı. Veloria Notes kurulumu onarılmalı.');
  const args = ['-NoProfile','-ExecutionPolicy','Bypass','-File',script,'-Mode',mode,'-Exe',process.execPath,'-InstallDir',path.dirname(process.execPath),'-UserData',app.getPath('userData'),'-BackupDir',appBackupDir];
  if (arg) args.push('-Package', arg);
  const child = spawn('powershell.exe', args, { detached: true, stdio: 'ignore', windowsHide: true }); child.unref();
  setTimeout(() => { isQuitting = true; app.quit(); }, 250);
  return { started: true };
}

async function listAppBackups() {
  await ensureDir(appBackupDir); const names = await fsp.readdir(appBackupDir).catch(() => []); const out=[];
  for (const name of names) { const full=path.join(appBackupDir,name); try { const st=await fsp.stat(full); if(st.isDirectory()) out.push({id:name,name,mtimeMs:st.mtimeMs}); } catch{} }
  return out.sort((a,b)=>b.mtimeMs-a.mtimeMs).slice(0,20);
}

function rendererFileFromUrl(url) {
  try {
    const parsed = new URL(String(url || ''));
    if (parsed.protocol !== 'file:') return '';
    return path.resolve(fileURLToPath(parsed));
  } catch { return ''; }
}

function samePath(a, b) {
  const left = path.resolve(String(a || ''));
  const right = path.resolve(String(b || ''));
  return process.platform === 'win32' ? left.toLowerCase() === right.toLowerCase() : left === right;
}

function expectedMainRendererPath() {
  return path.join(__dirname, recoveryMode ? 'recovery.html' : 'index.html');
}

function assertTrustedIpc(event) {
  if (!event || !event.sender || event.sender.isDestroyed()) throw new Error('Güvenilmeyen IPC isteği reddedildi.');
  if (event.senderFrame && event.sender.mainFrame && event.senderFrame !== event.sender.mainFrame) throw new Error('Alt çerçeveden gelen IPC isteği reddedildi.');
  const file = rendererFileFromUrl(event.senderFrame?.url || event.sender.getURL());
  const fromMain = !!mainWindow && !mainWindow.isDestroyed() && event.sender === mainWindow.webContents && samePath(file, expectedMainRendererPath());
  const fromQuick = !!quickWindow && !quickWindow.isDestroyed() && event.sender === quickWindow.webContents && samePath(file, path.join(__dirname, 'quick-capture.html'));
  if (!fromMain && !fromQuick) throw new Error('Güvenilmeyen IPC göndericisi reddedildi.');
  return true;
}

function handleTrusted(channel, listener) {
  ipcMain.handle(channel, async (event, ...args) => {
    assertTrustedIpc(event);
    return listener(event, ...args);
  });
}

function createWindow() {
  const b = config.windowBounds || {};
  mainWindow = new BrowserWindow({
    width: recoveryMode ? 980 : (Number(b.width) || 1440),
    height: recoveryMode ? 720 : (Number(b.height) || 900),
    x: Number.isFinite(b.x) ? b.x : undefined,
    y: Number.isFinite(b.y) ? b.y : undefined,
    minWidth: recoveryMode ? 760 : 960,
    minHeight: recoveryMode ? 560 : 650,
    backgroundColor: '#0b1220',
    show: false,
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, recoveryMode ? 'recovery-preload.js' : 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: false,
      backgroundThrottling: false,
      partition: 'veloria-memory'
    }
  });
  mainWindow.removeMenu();
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.webContents.on('did-finish-load', () => {
    rendererReady = true;
    flushRendererEvents();
  });
  mainWindow.loadFile(path.join(__dirname, recoveryMode ? 'recovery.html' : 'index.html'));

  mainWindow.on('resize', () => {
    if (!mainWindow.isMinimized() && !mainWindow.isMaximized()) config.windowBounds = mainWindow.getBounds();
  });
  mainWindow.on('move', () => {
    if (!mainWindow.isMinimized() && !mainWindow.isMaximized()) config.windowBounds = mainWindow.getBounds();
  });
  mainWindow.on('closed', () => { rendererReady = false; mainWindow = null; saveConfig().catch(() => {}); });
  mainWindow.on('close', (event) => {
    if (recoveryMode || !rendererReady || mainWindow.allowSavedClose || mainWindow.webContents.isCrashed()) return;
    event.preventDefault();
    mainWindow.webContents.send('veloria:before-close');
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^(https?:|mailto:)/i.test(url)) shell.openExternal(url).catch(() => {});
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const local = rendererFileFromUrl(url);
    if (local && samePath(local, expectedMainRendererPath())) return;
    event.preventDefault();
    if (/^(https?:|mailto:)/i.test(url)) shell.openExternal(url).catch(() => {});
    else if (/^veloria:\/\//i.test(url)) handleDeepLink(url);
  });
  mainWindow.webContents.on('app-command', (_event, command) => {
    if (command === 'browser-backward') emitToRenderer('veloria:navigation-command', { direction: 'back' });
    else if (command === 'browser-forward') emitToRenderer('veloria:navigation-command', { direction: 'forward' });
  });
}

function registerIpc() {
  handleTrusted('veloria:ready-to-close', async () => {
    if (mainWindow) { mainWindow.allowSavedClose = true; setImmediate(() => mainWindow?.close()); }
    return true;
  });
  handleTrusted('veloria:get-info', async () => ({
    isDesktop: true,
    version: app.getVersion(),
    rootPath: config.currentRoot,
    localOnly: true,
    dataPath: dataPaths().base,
    lockEnabled: lockStatus().enabled,
    globalQuickCapture: config.globalQuickCapture !== false,
    storageRoots: storageRootsInfo(),
    trashRetentionDays: config.trashRetentionDays || 30,
    recoveryMode,
    folderSchema: 2,
    noteFiles: { ...(config.noteFiles || {}) }
  }));

  handleTrusted('veloria:pick-and-move', chooseAndMove);
  handleTrusted('veloria:move-dropped', moveDropped);
  handleTrusted('veloria:import-dropped-copy', importDroppedCopy);
  handleTrusted('veloria:accept-import', acceptPendingImport);

  handleTrusted('veloria:organize-file', async (event, payload = {}) => {
    const source = assertManaged(payload.filePath);
    const meta = payload.meta || {};
    const selectedRoot = rootForMeta(meta);
    return organizeManagedFile({
      filePath: source,
      root: selectedRoot,
      roots: managedRoots(),
      indexPath,
      meta,
      onProgress: (p) => sendProgress(event.sender, { ...p, blockId: payload.meta?.blockId })
    });
  });

  handleTrusted('veloria:scan-files', async () => {
    const index = await refreshManagedIndex({ roots: managedRoots(), indexPath });
    return { files: index.files || [], directories: await v67ScanManagedDirectories(), rootPath: config.currentRoot };
  });

  handleTrusted('veloria:choose-root', async () => ({ canceled: false, rootPath: config.currentRoot, fixedLocalRoot: true }));

  handleTrusted('veloria:open-root', async () => {
    await ensureDir(config.currentRoot);
    return shell.openPath(config.currentRoot);
  });
  handleTrusted('veloria:open-install-folder', async () => shell.openPath(path.dirname(process.execPath)));
  handleTrusted('veloria:open-file', async (_e, filePath) => shell.openPath(assertManaged(filePath)));
  handleTrusted('veloria:reveal-file', async (_e, filePath) => { shell.showItemInFolder(assertManaged(filePath)); return true; });
  handleTrusted('veloria:stat-file', async (_e, filePath) => {
    try {
      const p = assertManaged(filePath);
      const st = await fsp.stat(p);
      return { exists: true, size: st.size, mtimeMs: st.mtimeMs, ctimeMs: st.ctimeMs, birthtimeMs: st.birthtimeMs, isFile: st.isFile(), isDirectory: st.isDirectory(), name: path.basename(p), ext: path.extname(p) };
    } catch (err) {
      if (err && err.code === 'ENOENT') return { exists: false };
      if (/yonetilen klasor/.test(String(err && err.message))) return { exists: false, denied: true };
      return { exists: false, error: err && err.message };
    }
  });
  handleTrusted('veloria:delete-file', async (event, filePath) => {
    const p = assertManaged(filePath);
    return withTransfer(event.sender, async (control, transferId) => {
      const item = await moveManagedToTrash({ filePath: p, roots: managedRoots(), trashIndexPath, indexPath, control, onProgress: (x) => transferProgress(event.sender, transferId, { ...x, stage: 'trash' }) });
      return { ok: true, trashed: true, item };
    });
  });


  handleTrusted('veloria:transfer-control', async (event, payload = {}) => {
    const transferId = String(payload.transferId || '');
    const control = transferControls.get(transferId);
    if (!control) return { ok: false, missing: true };
    const action = String(payload.action || '');
    if (action === 'pause') { control.pause(); transferProgress(event.sender, transferId, { status: 'paused' }); }
    else if (action === 'resume') { control.resume(); transferProgress(event.sender, transferId, { status: 'active' }); }
    else if (action === 'cancel') { control.cancel(); transferProgress(event.sender, transferId, { status: 'cancelling' }); }
    return { ok: true, paused: control.paused, cancelled: control.cancelled };
  });

  handleTrusted('veloria:preview-file', async (_e, filePath) => previewInfo(filePath));
  handleTrusted('veloria:save-image-drawing', async (_e, payload = {}) => saveImageDrawing(payload));
  handleTrusted('veloria:list-archive', async (_e, filePath) => listArchiveEntries(assertArchiveSource(filePath)));
  handleTrusted('veloria:preview-archive-entry', async (_e, payload = {}) => previewArchiveEntry(payload.archivePath, payload.entryPath));
  handleTrusted('veloria:open-archive-temp-external', async (_e, filePath) => {
    const p = path.resolve(String(filePath || ''));
    if (!isInsidePath(archivePreviewRoot(), p)) throw new Error('Geçici arşiv dosyası yolu geçersiz.');
    const err = await shell.openPath(p); if (err) throw new Error(err); return { ok: true };
  });
  handleTrusted('veloria:replace-version', chooseNewVersion);
  handleTrusted('veloria:list-versions', async (_e, filePath) => listManagedVersions({ filePath: assertManaged(filePath), roots: managedRoots() }));
  handleTrusted('veloria:restore-version', async (event, payload = {}) => withTransfer(event.sender, async (control, transferId) => ({ file: await restoreManagedVersion({ filePath: assertManaged(payload.filePath), versionId: payload.versionId, roots: managedRoots(), indexPath, control, onProgress: (x) => transferProgress(event.sender, transferId, x) }) })));

  handleTrusted('veloria:list-trash', async () => listTrash(trashIndexPath));
  handleTrusted('veloria:restore-trash', async (event, id) => withTransfer(event.sender, async (control, transferId) => ({ item: await restoreTrashItem({ id: String(id || ''), trashIndexPath, roots: managedRoots(), indexPath, control, onProgress: (x) => transferProgress(event.sender, transferId, { ...x, stage: 'trash-restore' }) }) })));
  handleTrusted('veloria:empty-trash', async () => {
    const items = await listTrash(trashIndexPath); let removed = 0;
    for (const item of items) { try { await fsp.rm(item.trashPath, { force: true }); removed++; } catch {} }
    await writeAtomic(trashIndexPath, JSON.stringify({ version: 1, items: [] }, null, 2));
    return { removed };
  });

  handleTrusted('veloria:verify-file', async (event, filePath) => {
    const p = assertManaged(filePath);
    return withTransfer(event.sender, async (control, transferId) => ({ sha256: await hashFile(p, (x) => transferProgress(event.sender, transferId, { ...x, stage: 'integrity' }), control), size: (await fsp.stat(p)).size }));
  });

  handleTrusted('veloria:move-managed-exact', async (event, payload = {}) => {
    const source = assertManaged(payload.source);
    let target = path.resolve(String(payload.target || ''));
    if (!isInsideAny(managedRoots(), target)) throw new Error('Hedef Veloria Notes depolama köklerinin dışında.');
    const resolved = await v67ResolveConflictTarget(target, String(payload.conflict || 'error'));
    if (resolved.skipped) return { ok: true, source, target: resolved.target, skipped: true };
    target = resolved.target;
    await ensureDir(path.dirname(target));
    return withTransfer(event.sender, async (control, transferId) => {
      const moved = await moveFile(source, target, (x) => transferProgress(event.sender, transferId, { ...x, stage: 'move' }), control);
      await refreshManagedIndex({ roots: managedRoots(), indexPath });
      return { ok: true, source, target, method: moved.method, skipped: false };
    });
  });

  handleTrusted('veloria:copy-managed-exact', async (event, payload = {}) => {
    const source = assertManaged(payload.source);
    let target = path.resolve(String(payload.target || ''));
    if (!isInsideAny(managedRoots(), target)) throw new Error('Hedef Veloria Notes depolama köklerinin dışında.');
    const resolved = await v67ResolveConflictTarget(target, String(payload.conflict || 'error'));
    if (resolved.skipped) return { ok: true, source, target: resolved.target, skipped: true };
    target = resolved.target;
    await ensureDir(path.dirname(target));
    return withTransfer(event.sender, async (control, transferId) => {
      const copied = await copyFileVerified(
        source,
        target,
        (x) => transferProgress(event.sender, transferId, { ...x, stage: x.stage || 'copy', name: path.basename(source) }),
        control
      );
      await refreshManagedIndex({ roots: managedRoots(), indexPath });
      return { ok: true, source, target, method: copied.method || 'copy', sha256: copied.sha256 || '', skipped: false };
    });
  });

  handleTrusted('veloria:make-managed-directory', async (_event, dirPath) => {
    const target = assertManaged(dirPath);
    await ensureDir(target);
    return { ok: true, path: target };
  });

  handleTrusted('veloria:prune-empty-directory', async (_event, dirPath) => {
    const target = assertManaged(dirPath);
    if (path.resolve(target) === path.resolve(config.currentRoot)) return { ok: false, root: true, removed: false };
    const isTreeEmpty = async (dir) => {
      let entries;
      try { entries = await fsp.readdir(dir, { withFileTypes: true }); }
      catch (err) { if (err?.code === 'ENOENT') return true; throw err; }
      for (const ent of entries) {
        const full = path.join(dir, ent.name);
        if (ent.isDirectory()) {
          if (!(await isTreeEmpty(full))) return false;
        } else {
          return false;
        }
      }
      return true;
    };
    if (!(await isTreeEmpty(target))) return { ok: true, removed: false, notEmpty: true };
    await fsp.rm(target, { recursive: true, force: true });
    return { ok: true, removed: true, path: target };
  });

  handleTrusted('veloria:write-text-safe', async (_event, payload = {}) => {
    const p = assertManaged(payload.filePath);
    const expected = Number(payload.expectedMtimeMs || 0);
    if (expected && fs.existsSync(p)) {
      const current = await fsp.stat(p);
      if (Math.abs(current.mtimeMs - expected) > 1) {
        return { ok: false, conflict: true, diskMtimeMs: current.mtimeMs, size: current.size };
      }
    }
    return writeManagedText(p, payload.text);
  });

  ipcMain.on('veloria:start-drag', (event, filePaths) => {
    try {
      assertTrustedIpc(event);
      const input = Array.isArray(filePaths) ? filePaths : [filePaths];
      const files = [];
      for (const raw of input) {
        try {
          const p = assertManaged(raw);
          if (fs.existsSync(p) && !files.includes(p)) files.push(p);
        } catch {}
      }
      if (!files.length) return;
      const iconPath = path.join(__dirname, 'icon.png');
      let icon = nativeImage.createFromPath(iconPath);
      if (!icon.isEmpty()) icon = icon.resize({ width: 32, height: 32 });
      event.sender.startDrag(files.length === 1 ? { file: files[0], icon } : { files, icon });
    } catch (e) { console.warn('Veloria start drag:', e?.message || e); }
  });
  handleTrusted('veloria:open-page-folder', async (_e, payload = {}) => {
    const root = rootForMeta(payload);
    const dir = path.join(root, pageFolderFromMeta(payload));
    if (!isInsideAny([root], dir)) throw new Error('Geçersiz sayfa klasörü.');
    await ensureDir(dir);
    return shell.openPath(dir);
  });

  handleTrusted('veloria:set-global-quick', async (_e, enabled) => { config.globalQuickCapture = !!enabled; await saveConfig(); registerGlobalShortcuts(); return { enabled: config.globalQuickCapture }; });

  handleTrusted('veloria:list-state-backups', async () => listStateBackups());
  handleTrusted('veloria:restore-state-backup', async (_e, id) => restoreStateBackup(String(id || '')));
  handleTrusted('veloria:choose-update-package', async () => {
    const pick = await dialog.showOpenDialog(mainWindow, { title: 'Veloria Notes güncelleme ZIP paketini seç', properties: ['openFile'], filters: [{ name: 'Veloria Notes Güncelleme ZIP', extensions: ['zip'] }] });
    if (pick.canceled || !pick.filePaths[0]) return { canceled: true };
    return launchUpdater('update', pick.filePaths[0]);
  });
  handleTrusted('veloria:list-app-backups', async () => listAppBackups());
  handleTrusted('veloria:rollback-app', async (_e, backupId) => launchUpdater('rollback', String(backupId || '')));
  handleTrusted('veloria:open-recovery', async () => {
    const child = spawn(process.execPath, ['--recovery'], { detached: true, stdio: 'ignore', windowsHide: false });
    child.unref();
    return { started: true };
  });

  handleTrusted('veloria:quick-submit', async (_e, payload = {}) => {
    const text = String(payload.text || '').trim(); if (!text) return { ok: false };
    showMainWindow(); emitToRenderer('veloria:quick-capture-submit', { text, mode: String(payload.mode || 'note') });
    quickWindow?.close(); return { ok: true };
  });
  handleTrusted('veloria:quick-close', async () => { quickWindow?.close(); return true; });

  handleTrusted('veloria:save-page-text', async (_e, payload = {}) => queueSave(`page:${payload.pageId}`,()=>savePageText(payload)));
  handleTrusted('veloria:delete-page-texts', async (_e, items = []) => deletePageTexts(items));
  handleTrusted('veloria:reconcile-page-texts', async (_e, validPageIds = []) => reconcilePageTexts(validPageIds));
  handleTrusted('veloria:read-text-file', async (_e, filePath) => readManagedText(filePath));
  handleTrusted('veloria:write-text-file', async (_e, payload = {}) => writeManagedText(payload.filePath, payload.text));
  handleTrusted('veloria:save-state', async (_e, text) => queueSave('state',()=>saveState(text)));
  handleTrusted('veloria:read-state', async () => readState());
  handleTrusted('veloria:save-ui-state', async (_e, text) => queueSave('ui',()=>saveUiState(text)));
  handleTrusted('veloria:read-ui-state', async () => readUiState());
  handleTrusted('veloria:save-draft', async (_e, payload = {}) => queueSave(`draft:${payload.key}`,()=>saveDraft(payload.key, payload.text)));
  handleTrusted('veloria:read-draft', async (_e, key) => readDraft(key));
  handleTrusted('veloria:delete-draft', async (_e, key) => deleteDraft(key));
  handleTrusted('veloria:open-backup-folder', async () => {
    const p = dataPaths();
    await ensureDir(p.backups);
    return shell.openPath(p.base);
  });
  handleTrusted('veloria:export-recovery', async () => exportRecovery());


  handleTrusted('veloria:lock-status', async () => lockStatus());
  handleTrusted('veloria:set-pin', async (_e, pin) => setPin(pin));
  handleTrusted('veloria:verify-pin', async (_e, pin) => ({ ok: verifyPin(pin) }));

  handleTrusted('veloria:notify', async (_e, payload = {}) => {
    if (!Notification.isSupported()) return { shown: false };
    const n = new Notification({
      title: String(payload.title || 'Veloria Notes'),
      body: String(payload.body || '').slice(0, 500),
      icon: path.join(__dirname, 'icon.png')
    });
    n.on('click', () => {
      showMainWindow();
      if (payload.pageId) emitToRenderer('veloria:navigate', { pageId: String(payload.pageId), taskId: String(payload.taskId || '') });
    });
    n.show();
    return { shown: true };
  });

  handleTrusted('veloria:show-window', async () => { showMainWindow(); return true; });
  handleTrusted('veloria:hide-window', async () => { mainWindow?.hide(); return true; });
  handleTrusted('veloria:quit', async () => { isQuitting = true; app.quit(); return true; });

  handleTrusted('veloria:open-external', async (_e, url) => {
    const u = String(url || '');
    if (!/^(https?:|mailto:)/i.test(u)) throw new Error('Yalnızca web bağlantıları açılabilir.');
    await shell.openExternal(u);
    return true;
  });
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    showMainWindow();
    parseLaunchArgs(argv);
  });

  app.on('open-url', (event, url) => { event.preventDefault(); handleDeepLink(url); });

  app.whenReady().then(async () => {
    await loadConfig();
    await ensureWindowsShellIntegration();
    registerIpc();
    createWindow();
    if (!recoveryMode && !process.env.VELORIA_DEV_DATA_ROOT) { registerGlobalShortcuts(); }
    if (app.isPackaged) try { app.setAsDefaultProtocolClient('veloria'); } catch {}
    parseLaunchArgs(process.argv);
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); else showMainWindow(); });
  }).catch((e) => {
    console.error('Veloria Notes başlatma hatası:', e);
    dialog.showErrorBox('Veloria Notes başlatılamadı', e?.message || String(e));
    app.quit();
  });

  app.on('before-quit', () => { isQuitting = true; globalShortcut.unregisterAll(); saveConfig().catch(() => {}); });
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
}
