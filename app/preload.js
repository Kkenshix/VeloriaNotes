'use strict';

const { contextBridge, ipcRenderer, webUtils } = require('electron');

function subscribe(channel, callback) {
  const handler = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

contextBridge.exposeInMainWorld('veloriaDesktop', {
  isDesktop: true,
  getInfo: () => ipcRenderer.invoke('veloria:get-info'),
  pickAndMoveFiles: (meta) => ipcRenderer.invoke('veloria:pick-and-move', meta || {}),
  moveDroppedFiles: (files, meta) => {
    const paths = [];
    for (const file of Array.from(files || [])) {
      try {
        const p = webUtils.getPathForFile(file);
        if (p) paths.push(p);
      } catch {}
    }
    return ipcRenderer.invoke('veloria:move-dropped', { paths, meta: meta || {} });
  },
  // HF10 copy-only import path used by rich-note paste and external drop.
  importDroppedFiles: async (files, meta) => {
    const paths = [];
    const buffers = [];
    let blobIndex = 0;
    for (const file of Array.from(files || [])) {
      let nativePath = '';
      try { nativePath = webUtils.getPathForFile(file) || ''; } catch {}
      if (nativePath) { paths.push(nativePath); continue; }
      const size = Number(file && file.size) || 0;
      if (size > 64 * 1024 * 1024) throw new Error('Panodan eklenen tek dosya 64 MB sınırını aşıyor. Dosyayı Windows Gezgini üzerinden sürükle.');
      try {
        const type = String(file && file.type || '');
        const ext = ({ 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'image/bmp': 'bmp' })[type] || 'bin';
        const fallback = type.startsWith('image/') ? `Pano-Gorsel-${Date.now()}-${++blobIndex}.${ext}` : `Pano-Dosya-${Date.now()}-${++blobIndex}.${ext}`;
        const data = new Uint8Array(await file.arrayBuffer());
        buffers.push({ name: String(file && file.name || fallback), type, data });
      } catch (err) {
        throw new Error(err && err.message ? err.message : 'Panodaki dosya okunamadı.');
      }
    }
    return ipcRenderer.invoke('veloria:import-dropped-copy', { paths, buffers, meta: { ...(meta || {}), importMode: 'copy', forcePhysicalCopy: true } });
  },
  acceptPendingImport: (token, meta) => ipcRenderer.invoke('veloria:accept-import', { token, meta: meta || {} }),
  organizeManagedFile: (filePath, meta) => ipcRenderer.invoke('veloria:organize-file', { filePath, meta: meta || {} }),
  scanManagedFiles: () => ipcRenderer.invoke('veloria:scan-files'),
  chooseRoot: () => ipcRenderer.invoke('veloria:choose-root'),
  openRoot: () => ipcRenderer.invoke('veloria:open-root'),
  openInstallFolder: () => ipcRenderer.invoke('veloria:open-install-folder'),
  openManagedFile: (filePath) => ipcRenderer.invoke('veloria:open-file', filePath),
  revealManagedFile: (filePath) => ipcRenderer.invoke('veloria:reveal-file', filePath),
  statManagedFile: (filePath) => ipcRenderer.invoke('veloria:stat-file', filePath),
  deleteManagedFile: (filePath) => ipcRenderer.invoke('veloria:delete-file', filePath),
  savePageText: (payload) => ipcRenderer.invoke('veloria:save-page-text', payload || {}),
  deletePageTexts: (pages) => ipcRenderer.invoke('veloria:delete-page-texts', Array.isArray(pages) ? pages : []),
  reconcilePageTexts: (validPageIds) => ipcRenderer.invoke('veloria:reconcile-page-texts', Array.isArray(validPageIds) ? validPageIds : []),
  readManagedText: (filePath) => ipcRenderer.invoke('veloria:read-text-file', filePath),
  writeManagedText: (filePath, text) => ipcRenderer.invoke('veloria:write-text-file', { filePath, text }),
  saveAppState: (text) => ipcRenderer.invoke('veloria:save-state', text),
  readAppState: () => ipcRenderer.invoke('veloria:read-state'),
  saveUiState: (text) => ipcRenderer.invoke('veloria:save-ui-state', String(text || '{}')),
  readUiState: () => ipcRenderer.invoke('veloria:read-ui-state'),
  saveDraft: (key, text) => ipcRenderer.invoke('veloria:save-draft', { key: String(key || ''), text: String(text || '') }),
  readDraft: (key) => ipcRenderer.invoke('veloria:read-draft', String(key || '')),
  deleteDraft: (key) => ipcRenderer.invoke('veloria:delete-draft', String(key || '')),
  openBackupFolder: () => ipcRenderer.invoke('veloria:open-backup-folder'),
  exportRecovery: () => ipcRenderer.invoke('veloria:export-recovery'),
  lockStatus: () => ipcRenderer.invoke('veloria:lock-status'),
  setPin: (pin) => ipcRenderer.invoke('veloria:set-pin', String(pin || '')),
  verifyPin: (pin) => ipcRenderer.invoke('veloria:verify-pin', String(pin || '')),
  notify: (payload) => ipcRenderer.invoke('veloria:notify', payload || {}),
  showWindow: () => ipcRenderer.invoke('veloria:show-window'),
  hideWindow: () => ipcRenderer.invoke('veloria:hide-window'),
  quit: () => ipcRenderer.invoke('veloria:quit'),
  onBeforeClose: (callback) => subscribe('veloria:before-close', callback),
  readyToClose: () => ipcRenderer.invoke('veloria:ready-to-close'),
  openExternal: (url) => ipcRenderer.invoke('veloria:open-external', url),
  transferControl: (transferId, action) => ipcRenderer.invoke('veloria:transfer-control', { transferId, action }),
  previewManagedFile: (filePath) => ipcRenderer.invoke('veloria:preview-file', filePath),
  saveImageDrawing: (filePath, data) => ipcRenderer.invoke('veloria:save-image-drawing', { filePath, data }),
  listArchiveEntries: (filePath) => ipcRenderer.invoke('veloria:list-archive', filePath),
  previewArchiveEntry: (archivePath, entryPath) => ipcRenderer.invoke('veloria:preview-archive-entry', { archivePath, entryPath }),
  openArchiveTempExternal: (filePath) => ipcRenderer.invoke('veloria:open-archive-temp-external', filePath),
  replaceManagedVersion: (filePath) => ipcRenderer.invoke('veloria:replace-version', { filePath }),
  listManagedVersions: (filePath) => ipcRenderer.invoke('veloria:list-versions', filePath),
  restoreManagedVersion: (filePath, versionId) => ipcRenderer.invoke('veloria:restore-version', { filePath, versionId }),
  listTrash: () => ipcRenderer.invoke('veloria:list-trash'),
  restoreTrash: (id) => ipcRenderer.invoke('veloria:restore-trash', id),
  emptyTrash: () => ipcRenderer.invoke('veloria:empty-trash'),
  verifyManagedFile: (filePath) => ipcRenderer.invoke('veloria:verify-file', filePath),
  moveManagedExact: (source, target, conflict = 'error') => ipcRenderer.invoke('veloria:move-managed-exact', { source, target, conflict }),
  copyManagedExact: (source, target, conflict = 'error') => ipcRenderer.invoke('veloria:copy-managed-exact', { source, target, conflict }),
  makeManagedDirectory: (dirPath) => ipcRenderer.invoke('veloria:make-managed-directory', dirPath),
  pruneEmptyManagedDirectory: (dirPath) => ipcRenderer.invoke('veloria:prune-empty-directory', dirPath),
  writeManagedTextSafe: (filePath, text, expectedMtimeMs = 0) => ipcRenderer.invoke('veloria:write-text-safe', { filePath, text, expectedMtimeMs }),
  startManagedDrag: (filePaths) => ipcRenderer.send('veloria:start-drag', filePaths),
  openPageFolder: (meta) => ipcRenderer.invoke('veloria:open-page-folder', meta || {}),
  setGlobalQuickCapture: (enabled) => ipcRenderer.invoke('veloria:set-global-quick', !!enabled),
  listStateBackups: () => ipcRenderer.invoke('veloria:list-state-backups'),
  restoreStateBackup: (id) => ipcRenderer.invoke('veloria:restore-state-backup', id),
  chooseUpdatePackage: () => ipcRenderer.invoke('veloria:choose-update-package'),
  listAppBackups: () => ipcRenderer.invoke('veloria:list-app-backups'),
  rollbackApp: (id) => ipcRenderer.invoke('veloria:rollback-app', id),
  openRecovery: () => ipcRenderer.invoke('veloria:open-recovery'),
  onFileProgress: (callback) => subscribe('veloria:file-progress', callback),
  onImportRequest: (callback) => subscribe('veloria:import-request', callback),
  onNavigate: (callback) => subscribe('veloria:navigate', callback),
  onNavigationCommand: (callback) => subscribe('veloria:navigation-command', callback),
  onQuickNote: (callback) => subscribe('veloria:quick-note', callback),
  onQuickCaptureSubmit: (callback) => subscribe('veloria:quick-capture-submit', callback),
  onShowFile: (callback) => subscribe('veloria:show-file', callback),
  onLockRequest: (callback) => subscribe('veloria:lock-request', callback)
});
