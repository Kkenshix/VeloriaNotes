'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('veloriaDesktop', {
  listStateBackups: () => ipcRenderer.invoke('veloria:list-state-backups'),
  restoreStateBackup: (id) => ipcRenderer.invoke('veloria:restore-state-backup', String(id || '')),
  listAppBackups: () => ipcRenderer.invoke('veloria:list-app-backups'),
  rollbackApp: (id) => ipcRenderer.invoke('veloria:rollback-app', String(id || '')),
  exportRecovery: () => ipcRenderer.invoke('veloria:export-recovery'),
  openBackupFolder: () => ipcRenderer.invoke('veloria:open-backup-folder'),
  openRoot: () => ipcRenderer.invoke('veloria:open-root'),
  openInstallFolder: () => ipcRenderer.invoke('veloria:open-install-folder'),
  quit: () => ipcRenderer.invoke('veloria:quit')
});
