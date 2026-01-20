// === ELECTRON MUST BE REQUIRED FIRST ===
// Before ANY other requires to ensure Electron's module hook is active
const electron = require('electron');
const { app, BrowserWindow, Tray, Menu, ipcMain, clipboard, Notification, shell, dialog } = electron;

// Now we can require other modules
const fs = require('fs');
const os = require('os');
const pathModule = require('path');

const BUILD_STAMP = '2026-01-19-epipe-fix-v4';
const BOOT_LOG = pathModule.join(os.homedir(), 'rrightclickrr-boot.log');

// File-based logger that NEVER touches stdout/stderr
function bootLog(...args) {
  try {
    fs.appendFileSync(BOOT_LOG, `[${new Date().toISOString()}] ${args.map(String).join(' ')}\n`);
  } catch {}
}

// Log boot stamp immediately to verify this code is running
bootLog('=== APP BOOT ===', BUILD_STAMP);
bootLog('execPath:', process.execPath);
bootLog('argv:', JSON.stringify(process.argv));
bootLog('electron typeof:', typeof electron);
bootLog('app defined:', !!app);

// If electron returned a string, we have a problem
if (typeof electron === 'string') {
  bootLog('FATAL: electron require returned a string, not a module');
  bootLog('electron value:', electron);
  process.exit(1);
}

// PATCH #1: Replace console methods to NEVER write to stdout/stderr
console.log = (...a) => bootLog('[log]', ...a);
console.info = (...a) => bootLog('[info]', ...a);
console.warn = (...a) => bootLog('[warn]', ...a);
console.error = (...a) => bootLog('[error]', ...a);
console.debug = (...a) => bootLog('[debug]', ...a);
console.trace = (...a) => bootLog('[trace]', ...a);

// PATCH #2: Also kill process.stdout.write and process.stderr.write directly
try {
  const swallow = () => true;
  if (process.stdout?.write) process.stdout.write = swallow;
  if (process.stderr?.write) process.stderr.write = swallow;
} catch (e) {
  bootLog('[stdout patch failed]', e?.message);
}

// Also catch any uncaught exceptions
process.on('uncaughtException', (err) => {
  if (err?.code === 'EPIPE') {
    bootLog('[EPIPE ignored]');
    return;
  }
  bootLog('[UNCAUGHT]', err?.stack || err?.message || err);
});

// Disable Electron's error dialog
if (dialog?.showErrorBox) {
  dialog.showErrorBox = () => {};
  bootLog('dialog.showErrorBox disabled');
}

// Alias for the rest of the app
let logDir = os.homedir();
let logPath = pathModule.join(logDir, 'rrightclickrr.log');

function log(...args) {
  try {
    fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${args.join(' ')}\n`);
  } catch {}
}

const safeLog = log;

function initLogging(appInstance) {
  try {
    logDir = appInstance.getPath('userData');
    logPath = pathModule.join(logDir, 'rrightclickrr.log');
    safeLog('Logging initialized to:', logPath);
  } catch (e) {}
}

require('dotenv').config();
const path = require('path');
const Store = require('electron-store');
const { GoogleAuth } = require('./src/lib/google-auth');
const { DriveUploader } = require('./src/lib/drive-uploader');
const { FolderSync } = require('./src/lib/folder-sync');
const { SyncTracker } = require('./src/lib/sync-tracker');
const { FolderWatcher } = require('./src/lib/folder-watcher');

// Single instance lock
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  // Another instance is running, pass args to it and quit
  app.quit();
} else {
  let mainWindow = null;
  let tray = null;
  let store = null;
  let googleAuth = null;
  let driveUploader = null;
  let syncTracker = null;
  let folderWatcher = null;

  // Initialize store
  store = new Store({
    name: 'rrightclickrr-config',
    defaults: {
      folderMappings: [],
      lastDriveFolder: null,
      autoUpload: true,
      showNotifications: true
    }
  });

  function createTray() {
    // Use PNG for tray (works on all platforms, ICO can have size issues)
    const isPackaged = app.isPackaged;
    const assetsPath = isPackaged
      ? path.join(process.resourcesPath, 'assets')
      : path.join(__dirname, 'assets');

    // Try PNG first (most reliable), then ICO as fallback
    const iconCandidates = ['tray-icon.png', 'icon.png', 'rrightclickrr.ico'];
    let iconPath = null;
    const fs = require('fs');

    for (const candidate of iconCandidates) {
      const testPath = path.join(assetsPath, candidate);
      if (fs.existsSync(testPath)) {
        iconPath = testPath;
        safeLog('Using tray icon:', testPath);
        break;
      }
    }

    if (!iconPath) {
      safeLog('No tray icon found in:', assetsPath);
      return;
    }

    try {
      const { nativeImage } = require('electron');
      // Resize to 16x16 for Windows tray (standard size)
      let icon = nativeImage.createFromPath(iconPath);
      if (icon.isEmpty()) {
        safeLog('Icon is empty:', iconPath);
        return;
      }
      // Resize for tray - Windows expects 16x16 or will scale poorly
      icon = icon.resize({ width: 16, height: 16 });
      tray = new Tray(icon);
    } catch (error) {
      safeLog('Failed to create tray icon:', error.message);
      return;
    }

    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Open Settings',
        click: () => createWindow()
      },
      { type: 'separator' },
      {
        label: 'Sign in to Google Drive',
        click: async () => {
          try {
            await googleAuth.authenticate();
            showNotification('Signed In', 'Successfully connected to Google Drive!');
            updateTrayMenu();
          } catch (error) {
            showNotification('Sign In Failed', error.message);
          }
        },
        visible: !googleAuth?.isAuthenticated()
      },
      {
        label: 'Sign Out',
        click: async () => {
          await googleAuth.signOut();
          showNotification('Signed Out', 'Disconnected from Google Drive');
          updateTrayMenu();
        },
        visible: googleAuth?.isAuthenticated()
      },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => {
          app.isQuitting = true;
          app.quit();
        }
      }
    ]);

    tray.setToolTip('RRightclickrr - Google Drive Sync');
    tray.setContextMenu(contextMenu);

    tray.on('double-click', () => createWindow());
  }

  function updateTrayMenu() {
    if (tray) {
      const isAuthenticated = googleAuth?.isAuthenticated();
      const watchedFolders = folderWatcher ? folderWatcher.getWatchedFolders() : [];

      // Build watched folders submenu
      const watchedFolderItems = watchedFolders.length > 0
        ? watchedFolders.map(folder => ({
            label: path.basename(folder.localPath),
            submenu: [
              {
                label: 'Open in Explorer',
                click: () => shell.openPath(folder.localPath)
              },
              {
                label: 'Open in Google Drive',
                click: () => {
                  const driveUrl = folder.driveId === 'root'
                    ? 'https://drive.google.com/drive/my-drive'
                    : `https://drive.google.com/drive/folders/${folder.driveId}`;
                  shell.openExternal(driveUrl);
                }
              },
              { type: 'separator' },
              {
                label: 'Stop Watching',
                click: () => {
                  folderWatcher.unwatch(folder.localPath);
                  // Also update the mapping in store
                  const mappings = store.get('folderMappings') || [];
                  const updated = mappings.map(m =>
                    m.localPath === folder.localPath ? { ...m, watching: false } : m
                  );
                  store.set('folderMappings', updated);
                  updateTrayMenu();
                  updateTrayTooltip();
                }
              }
            ]
          }))
        : [{ label: 'No folders being watched', enabled: false }];

      const contextMenu = Menu.buildFromTemplate([
        {
          label: 'Open Settings',
          click: () => createWindow()
        },
        { type: 'separator' },
        {
          label: 'Watched Folders',
          submenu: watchedFolderItems
        },
        { type: 'separator' },
        {
          label: 'Sign in to Google Drive',
          click: async () => {
            try {
              await googleAuth.authenticate();
              showNotification('Signed In', 'Successfully connected to Google Drive!');
              updateTrayMenu();
            } catch (error) {
              showNotification('Sign In Failed', error.message);
            }
          },
          visible: !isAuthenticated
        },
        {
          label: 'Sign Out',
          click: async () => {
            await googleAuth.signOut();
            showNotification('Signed Out', 'Disconnected from Google Drive');
            updateTrayMenu();
          },
          visible: isAuthenticated
        },
        { type: 'separator' },
        {
          label: 'Quit',
          click: () => {
            app.isQuitting = true;
            app.quit();
          }
        }
      ]);
      tray.setContextMenu(contextMenu);
    }
  }

  function createWindow() {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
      return;
    }

    mainWindow = new BrowserWindow({
      width: 800,
      height: 600,
      minWidth: 600,
      minHeight: 400,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, 'preload.js')
      },
      icon: path.join(__dirname, 'assets', 'icon.png'),
      title: 'RRightclickrr - Google Drive Sync',
      backgroundColor: '#2C6E49'
    });

    mainWindow.loadFile('src/ui/index.html');

    mainWindow.on('close', (event) => {
      if (!app.isQuitting) {
        event.preventDefault();
        mainWindow.hide();
      }
    });

    mainWindow.on('closed', () => {
      mainWindow = null;
    });
  }

  function showNotification(title, body) {
    if (store.get('showNotifications')) {
      new Notification({ title, body }).show();
    }
  }

  let progressWindow = null;
  let currentSync = null; // Track current sync for cancellation

  // Handle sync cancel from progress window
  ipcMain.on('sync-cancel', () => {
    if (currentSync) {
      currentSync.cancel();
    }
    if (progressWindow) {
      progressWindow.webContents.send('sync-cancelled');
    }
  });

  function createProgressWindow(folderPath) {
    return new Promise((resolve) => {
      progressWindow = new BrowserWindow({
        width: 500,
        height: 360,
        frame: false,
        transparent: false,
        alwaysOnTop: true,
        resizable: false,
        skipTaskbar: true,
        backgroundColor: '#1a1a1a',
        webPreferences: {
          nodeIntegration: true,
          contextIsolation: false
        }
      });

      progressWindow.loadFile(path.join(__dirname, 'src', 'ui', 'progress.html'));
      progressWindow.webContents.on('did-finish-load', () => {
        progressWindow.webContents.send('sync-init', { folderPath });
        resolve(progressWindow); // Resolve AFTER window is ready
      });

      progressWindow.on('closed', () => {
        progressWindow = null;
      });
    });
  }

  async function handleFolderUpload(folderPath) {
    if (!googleAuth.isAuthenticated()) {
      showNotification('Not Signed In', 'Please sign in to Google Drive first.');
      createWindow();
      return;
    }

    // Show progress window - WAIT for it to be ready before starting sync
    await createProgressWindow(folderPath);

    try {
      const folderSync = new FolderSync(driveUploader, store, logDir);
      currentSync = folderSync; // Track for cancellation
      const result = await folderSync.syncFolder(folderPath, (progress) => {
        // Update progress window
        if (progressWindow) {
          progressWindow.webContents.send('sync-progress', progress);
        }
        // Update tray tooltip with progress
        if (tray) {
          tray.setToolTip(`Syncing... ${progress.current}/${progress.total} files`);
        }
      });
      currentSync = null; // Clear after completion

      // Check if cancelled
      if (folderSync.cancelled) {
        if (progressWindow) {
          progressWindow.close();
          progressWindow = null;
        }
        updateTrayTooltip();
        return;
      }

      // Track this sync in our database
      if (result.folderId && result.shareLink) {
        syncTracker.trackSync(folderPath, result.folderId, result.shareLink, 'folder');

        // Track each uploaded file individually
        if (result.uploadedFiles) {
          for (const file of result.uploadedFiles) {
            syncTracker.trackSync(file.localPath, file.driveId, file.driveUrl, 'file');
          }
        }

        // Add to folder mappings and start watching
        const mappings = store.get('folderMappings') || [];
        const existingIndex = mappings.findIndex(m => m.localPath === folderPath);

        if (existingIndex === -1) {
          // Add new mapping
          mappings.push({
            localPath: folderPath,
            driveId: result.folderId,
            driveName: path.basename(folderPath),
            watching: true
          });
          store.set('folderMappings', mappings);
        }

        // Start watching this folder
        folderWatcher.watch(folderPath, result.folderId, path.basename(folderPath));
        updateTrayTooltip();
      }

      if (result.shareLink) {
        clipboard.writeText(result.shareLink);
      }

      // Show completion in progress window
      if (progressWindow) {
        progressWindow.webContents.send('sync-complete', {
          filesUploaded: result.filesUploaded,
          shareLink: result.shareLink
        });
      }

      updateTrayTooltip();
    } catch (error) {
      safeLog('Upload failed:', error);
      showNotification('Sync Failed', error.message);
      if (progressWindow) {
        progressWindow.webContents.send('sync-error', { error: error.message });
      }
      updateTrayTooltip();
    }
  }

  // Copy to Google Drive (one-time upload, NO watching)
  async function handleCopyToGdrive(folderPath) {
    if (!googleAuth.isAuthenticated()) {
      showNotification('Not Signed In', 'Please sign in to Google Drive first.');
      createWindow();
      return;
    }

    // Show progress window - WAIT for it to be ready before starting sync
    await createProgressWindow(folderPath);

    try {
      const folderSync = new FolderSync(driveUploader, store, logDir);
      currentSync = folderSync; // Track for cancellation
      const result = await folderSync.syncFolder(folderPath, (progress) => {
        if (progressWindow) {
          progressWindow.webContents.send('sync-progress', progress);
        }
        if (tray) {
          tray.setToolTip(`Copying... ${progress.current}/${progress.total} files`);
        }
      });
      currentSync = null; // Clear after completion

      // Check if cancelled
      if (folderSync.cancelled) {
        if (progressWindow) {
          progressWindow.close();
          progressWindow = null;
        }
        updateTrayTooltip();
        return;
      }

      // Track this sync in our database (for URL retrieval later)
      if (result.folderId && result.shareLink) {
        syncTracker.trackSync(folderPath, result.folderId, result.shareLink, 'folder');

        // Track each uploaded file individually
        if (result.uploadedFiles) {
          for (const file of result.uploadedFiles) {
            syncTracker.trackSync(file.localPath, file.driveId, file.driveUrl, 'file');
          }
        }

        // NOTE: We do NOT add to folderMappings or start watching!
        // This is the key difference from handleFolderUpload
      }

      if (result.shareLink) {
        clipboard.writeText(result.shareLink);
      }

      // Show completion in progress window
      if (progressWindow) {
        progressWindow.webContents.send('sync-complete', {
          filesUploaded: result.filesUploaded,
          shareLink: result.shareLink
        });
      }

      showNotification('Copy Complete', `Copied ${result.filesUploaded} files. Link copied to clipboard.`);
      updateTrayTooltip();
    } catch (error) {
      safeLog('Copy failed:', error);
      showNotification('Copy Failed', error.message);
      if (progressWindow) {
        progressWindow.webContents.send('sync-error', { error: error.message });
      }
      updateTrayTooltip();
    }
  }

  async function handleGetUrl(itemPath) {
    const fs = require('fs');
    const isFile = fs.existsSync(itemPath) && fs.statSync(itemPath).isFile();

    // Check if this exact path was synced
    const syncInfo = syncTracker.getSyncInfo(itemPath);

    if (syncInfo && syncInfo.driveUrl) {
      clipboard.writeText(syncInfo.driveUrl);
      showNotification('Link Copied!', `Google Drive link copied to clipboard.`);
      return;
    }

    // Check if any parent folder was synced
    const parentInfo = syncTracker.getParentSyncInfo(itemPath);

    if (parentInfo) {
      clipboard.writeText(parentInfo.driveUrl);
      const itemType = isFile ? 'file' : 'folder';
      showNotification(
        'Parent Folder Link Copied',
        `This ${itemType} is inside a synced folder. Parent folder link copied.`
      );
      return;
    }

    // Not synced at all
    const itemType = isFile ? 'file' : 'folder';
    showNotification(
      'Not Synced',
      `This ${itemType} hasn't been synced yet. Sync the parent folder first.`
    );
  }

  // Open item directly in Google Drive browser
  async function handleOpenInDrive(itemPath) {
    const fs = require('fs');
    const isFile = fs.existsSync(itemPath) && fs.statSync(itemPath).isFile();

    // Check if this exact path was synced
    const syncInfo = syncTracker.getSyncInfo(itemPath);

    if (syncInfo && syncInfo.driveUrl) {
      shell.openExternal(syncInfo.driveUrl);
      return;
    }

    // Check if any parent folder was synced
    const parentInfo = syncTracker.getParentSyncInfo(itemPath);

    if (parentInfo) {
      shell.openExternal(parentInfo.driveUrl);
      return;
    }

    // Not synced at all
    const itemType = isFile ? 'file' : 'folder';
    showNotification(
      'Not Synced',
      `This ${itemType} hasn't been synced yet. Sync the parent folder first.`
    );
  }

  // Handle command line arguments (from context menu)
  function handleArgs(argv) {
    // Helper to find a path argument (doesn't start with --)
    function findPathAfterFlag(args, flag) {
      const flagIndex = args.indexOf(flag);
      if (flagIndex === -1) return null;

      // Look for the next argument that looks like a path (not a flag)
      for (let i = flagIndex + 1; i < args.length; i++) {
        const arg = args[i];
        if (arg && !arg.startsWith('--') && !arg.startsWith('-')) {
          // Skip the app directory path, look for actual folder paths
          if (arg.includes(':\\') && !arg.includes('node_modules') && !arg.includes('rrightclickrr\\node_modules')) {
            return arg;
          }
        }
      }
      return null;
    }

    // Look for --sync-folder argument (upload + watch)
    const folderPath = findPathAfterFlag(argv, '--sync-folder');
    if (folderPath) {
      handleFolderUpload(folderPath);
      return;
    }

    // Look for --copy-folder argument (upload only, no watching)
    const copyPath = findPathAfterFlag(argv, '--copy-folder');
    if (copyPath) {
      handleCopyToGdrive(copyPath);
      return;
    }

    // Look for --get-url argument
    const urlPath = findPathAfterFlag(argv, '--get-url');
    if (urlPath) {
      handleGetUrl(urlPath);
      return;
    }

    // Look for --open-drive argument
    const openPath = findPathAfterFlag(argv, '--open-drive');
    if (openPath) {
      handleOpenInDrive(openPath);
      return;
    }
  }

  // Second instance handling
  app.on('second-instance', (event, argv, workingDirectory) => {
    safeLog('Second instance detected with args:', argv);
    handleArgs(argv);
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  // IPC Handlers
  ipcMain.handle('get-settings', () => {
    return {
      folderMappings: store.get('folderMappings'),
      autoUpload: store.get('autoUpload'),
      showNotifications: store.get('showNotifications'),
      isAuthenticated: googleAuth?.isAuthenticated() || false
    };
  });

  ipcMain.handle('save-settings', (event, settings) => {
    if (settings.folderMappings !== undefined) {
      store.set('folderMappings', settings.folderMappings);
    }
    if (settings.autoUpload !== undefined) {
      store.set('autoUpload', settings.autoUpload);
    }
    if (settings.showNotifications !== undefined) {
      store.set('showNotifications', settings.showNotifications);
    }
    return true;
  });

  ipcMain.handle('authenticate', async () => {
    try {
      await googleAuth.authenticate();
      updateTrayMenu();
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('sign-out', async () => {
    await googleAuth.signOut();
    updateTrayMenu();
    return { success: true };
  });

  ipcMain.handle('get-drive-folders', async () => {
    if (!googleAuth.isAuthenticated()) {
      return { success: false, error: 'Not authenticated' };
    }
    try {
      const folders = await driveUploader.listFolders();
      return { success: true, folders };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('select-local-folder', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory']
    });
    if (result.canceled) {
      return { success: false };
    }
    return { success: true, path: result.filePaths[0] };
  });

  ipcMain.handle('register-context-menu', async () => {
    try {
      const { registerContextMenu } = require('./src/lib/context-menu');
      await registerContextMenu();
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('unregister-context-menu', async () => {
    try {
      const { unregisterContextMenu } = require('./src/lib/context-menu');
      await unregisterContextMenu();
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('is-context-menu-registered', async () => {
    try {
      const { isContextMenuRegistered } = require('./src/lib/context-menu');
      return await isContextMenuRegistered();
    } catch (error) {
      return false;
    }
  });

  ipcMain.handle('restart-explorer', async () => {
    const { exec } = require('child_process');
    return new Promise((resolve) => {
      // Kill and restart Explorer to apply registry changes
      exec('taskkill /F /IM explorer.exe && start explorer.exe', { shell: true }, (error) => {
        // Explorer restarts automatically even if taskkill "fails"
        setTimeout(() => resolve({ success: true }), 2000);
      });
    });
  });

  ipcMain.handle('test-sync', async (event, folderPath) => {
    await handleFolderUpload(folderPath);
    return { success: true };
  });

  app.whenReady().then(async () => {
    // Switch to proper logging directory
    initLogging(app);

    // Initialize Google Auth
    googleAuth = new GoogleAuth(store);
    driveUploader = new DriveUploader(googleAuth);
    syncTracker = new SyncTracker();

    // Initialize folder watcher
    folderWatcher = new FolderWatcher();

    // Handle file changes from watcher
    folderWatcher.on('file-changed', async (data) => {
      if (!googleAuth.isAuthenticated()) {
        safeLog('Skipping auto-sync - not authenticated');
        return;
      }

      const { filePath, driveId, driveName, relativePath, type } = data;

      // Update tray to show syncing
      if (tray) {
        tray.setToolTip(`Syncing: ${relativePath}`);
      }

      try {
        // Upload the single file
        await driveUploader.uploadFile(filePath, driveId);

        if (store.get('showNotifications')) {
          showNotification('File Synced', `${relativePath} uploaded to ${driveName}`);
        }
      } catch (error) {
        safeLog('Auto-sync failed:', error.message);
        showNotification('Sync Failed', `Failed to sync ${relativePath}: ${error.message}`);
      }

      // Update tray back to normal
      updateTrayTooltip();
    });

    folderWatcher.on('watching', (data) => {
      safeLog('Now watching:', data.localPath);
      updateTrayTooltip();
    });

    folderWatcher.on('error', (data) => {
      safeLog('Watcher error:', data.error);
    });

    // Start watching existing folder mappings
    const mappings = store.get('folderMappings') || [];
    for (const mapping of mappings) {
      if (mapping.watching !== false) { // Default to watching
        folderWatcher.watch(mapping.localPath, mapping.driveId, mapping.driveName);
      }
    }

    createTray();

    // Check for folder argument on startup
    handleArgs(process.argv);

    // Show window on first run
    if (!store.get('hasRunBefore')) {
      store.set('hasRunBefore', true);
      createWindow();
    }
  });

  function updateTrayTooltip() {
    if (!tray) return;
    const watchedCount = folderWatcher ? folderWatcher.getWatchedFolders().length : 0;
    if (watchedCount > 0) {
      tray.setToolTip(`RRightclickrr - Watching ${watchedCount} folder${watchedCount > 1 ? 's' : ''}`);
    } else {
      tray.setToolTip('RRightclickrr - Google Drive Sync');
    }
    // Also update the menu to reflect current state
    updateTrayMenu();
  }

  app.on('window-all-closed', () => {
    // Don't quit on window close, keep running in tray
  });

  app.on('activate', () => {
    createWindow();
  });

  app.on('before-quit', () => {
    app.isQuitting = true;
    // Clean up folder watchers
    if (folderWatcher) {
      folderWatcher.unwatchAll();
    }
  });
}
