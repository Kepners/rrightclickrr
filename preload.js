const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Settings
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),

  // Authentication
  authenticate: () => ipcRenderer.invoke('authenticate'),
  signOut: () => ipcRenderer.invoke('sign-out'),

  // Drive operations
  getDriveFolders: () => ipcRenderer.invoke('get-drive-folders'),
  selectLocalFolder: () => ipcRenderer.invoke('select-local-folder'),
  testSync: (folderPath) => ipcRenderer.invoke('test-sync', folderPath),

  // Context menu registration
  registerContextMenu: () => ipcRenderer.invoke('register-context-menu'),
  unregisterContextMenu: () => ipcRenderer.invoke('unregister-context-menu'),

  // Events
  onSyncProgress: (callback) => {
    ipcRenderer.on('sync-progress', (event, progress) => callback(progress));
  },
  onSyncComplete: (callback) => {
    ipcRenderer.on('sync-complete', (event, result) => callback(result));
  }
});
