require('dotenv').config();
const { app, BrowserWindow, Tray, Menu, ipcMain, clipboard, Notification, dialog, shell } = require('electron');
const path = require('path');
const Store = require('electron-store');
const { GoogleAuth } = require('./src/lib/google-auth');
const { DriveUploader } = require('./src/lib/drive-uploader');
const { FolderSync } = require('./src/lib/folder-sync');
const { SyncTracker } = require('./src/lib/sync-tracker');

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
    // Use ICO for Windows, PNG for other platforms
    const iconName = process.platform === 'win32' ? 'rrightclickrr.ico' : 'tray-icon.png';
    const iconPath = path.join(__dirname, 'assets', iconName);
    try {
      tray = new Tray(iconPath);
    } catch (error) {
      console.error('Failed to create tray icon:', error.message);
      console.error('Icon path:', iconPath);
      // Try with nativeImage as fallback
      const { nativeImage } = require('electron');
      const icon = nativeImage.createFromPath(iconPath);
      if (icon.isEmpty()) {
        console.error('Icon is empty, skipping tray creation');
        return;
      }
      tray = new Tray(icon);
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

  async function handleFolderUpload(folderPath) {
    if (!googleAuth.isAuthenticated()) {
      showNotification('Not Signed In', 'Please sign in to Google Drive first.');
      createWindow();
      return;
    }

    try {
      showNotification('Sync Started', `Syncing: ${path.basename(folderPath)}`);

      const folderSync = new FolderSync(driveUploader, store);
      const result = await folderSync.syncFolder(folderPath, (progress) => {
        // Update tray tooltip with progress
        if (tray) {
          tray.setToolTip(`Syncing... ${progress.current}/${progress.total} files`);
        }
      });

      // Track this sync in our database
      if (result.folderId && result.shareLink) {
        syncTracker.trackSync(folderPath, result.folderId, result.shareLink, 'folder');
      }

      if (result.shareLink) {
        clipboard.writeText(result.shareLink);
        showNotification(
          'Sync Complete!',
          `${result.filesUploaded} files synced. Link copied to clipboard!`
        );
      } else {
        showNotification(
          'Sync Complete!',
          `${result.filesUploaded} files synced to Google Drive.`
        );
      }

      if (tray) {
        tray.setToolTip('RRightclickrr - Google Drive Sync');
      }
    } catch (error) {
      console.error('Upload failed:', error);
      showNotification('Sync Failed', error.message);
      if (tray) {
        tray.setToolTip('RRightclickrr - Google Drive Sync');
      }
    }
  }

  async function handleGetUrl(folderPath) {
    // Check if this folder has been synced
    const syncInfo = syncTracker.getSyncInfo(folderPath);

    if (syncInfo && syncInfo.driveUrl) {
      clipboard.writeText(syncInfo.driveUrl);
      showNotification('URL Copied!', `Google Drive URL copied to clipboard.`);
      return;
    }

    // Check if any parent folder was synced
    const parentInfo = syncTracker.getParentSyncInfo(folderPath);

    if (parentInfo) {
      // The folder itself wasn't synced, but a parent was
      // We could try to construct the URL or just show the parent's URL
      clipboard.writeText(parentInfo.driveUrl);
      showNotification(
        'Parent Folder URL Copied',
        `This exact folder wasn't synced, but the parent folder URL was copied.`
      );
      return;
    }

    // Not synced at all
    showNotification(
      'Not Synced',
      'This folder hasn\'t been synced to Google Drive yet. Right-click and choose "Sync to Google Drive" first.'
    );
  }

  // Handle command line arguments (from context menu)
  function handleArgs(argv) {
    // Look for --sync-folder argument
    const syncIndex = argv.indexOf('--sync-folder');
    if (syncIndex !== -1 && argv[syncIndex + 1]) {
      const folderPath = argv[syncIndex + 1];
      handleFolderUpload(folderPath);
      return;
    }

    // Look for --get-url argument
    const urlIndex = argv.indexOf('--get-url');
    if (urlIndex !== -1 && argv[urlIndex + 1]) {
      const folderPath = argv[urlIndex + 1];
      handleGetUrl(folderPath);
      return;
    }
  }

  // Second instance handling
  app.on('second-instance', (event, argv, workingDirectory) => {
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

  ipcMain.handle('test-sync', async (event, folderPath) => {
    await handleFolderUpload(folderPath);
    return { success: true };
  });

  app.whenReady().then(async () => {
    // Initialize Google Auth
    googleAuth = new GoogleAuth(store);
    driveUploader = new DriveUploader(googleAuth);
    syncTracker = new SyncTracker();

    createTray();

    // Check for folder argument on startup
    handleArgs(process.argv);

    // Show window on first run
    if (!store.get('hasRunBefore')) {
      store.set('hasRunBefore', true);
      createWindow();
    }
  });

  app.on('window-all-closed', () => {
    // Don't quit on window close, keep running in tray
  });

  app.on('activate', () => {
    createWindow();
  });

  app.on('before-quit', () => {
    app.isQuitting = true;
  });
}
