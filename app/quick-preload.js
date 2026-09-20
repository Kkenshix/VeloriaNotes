'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('quickVeloria', {
  submit: (text, mode) => ipcRenderer.invoke('veloria:quick-submit', { text, mode }),
  close: () => ipcRenderer.invoke('veloria:quick-close')
});
