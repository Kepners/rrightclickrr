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

// Load .env from app directory (works for both dev and packaged)
const path = require('path');
const appRoot = app.isPackaged
  ? path.dirname(process.execPath)
  : __dirname;
require('dotenv').config({ path: path.join(appRoot, '.env') });
bootLog('dotenv loaded from:', path.join(appRoot, '.env'));
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
      showNotifications: true,
      syncQueue: [],
      activeSyncSession: null,
      lastSyncReport: null,
      retryMaxAttempts: 3,
      retryBaseDelayMs: 1000,
      retryMaxDelayMs: 20000,
      verifyUploads: true,
      verifySampleRate: 0.2,
      uploadBandwidthLimitKbps: 0,
      uploadScheduleEnabled: false,
      uploadScheduleStart: '00:00',
      uploadScheduleEnd: '23:59',
      autoResumeInterruptedSync: true,
      conflictPolicy: 'keep-both-local-wins',
      avgUploadSpeedBps: 0
    }
  });

  function normalizeLocalPath(p) {
    return path.normalize(p).toLowerCase();
  }

  function normalizeExcludePaths(paths = []) {
    return [...paths].map(p => p.toLowerCase()).sort();
  }

  function areExclusionsEqual(a = [], b = []) {
    const left = normalizeExcludePaths(a);
    const right = normalizeExcludePaths(b);
    if (left.length !== right.length) return false;
    return left.every((item, idx) => item === right[idx]);
  }

  function syncWatchersWithMappings(nextMappings = []) {
    if (!folderWatcher) return;

    const watchedFolders = folderWatcher.getWatchedFolders();

    // Stop watchers for removed/disabled entries.
    for (const watched of watchedFolders) {
      const matching = nextMappings.find(m => normalizeLocalPath(m.localPath) === normalizeLocalPath(watched.localPath));
      if (!matching || matching.watching === false) {
        folderWatcher.unwatch(watched.localPath);
      }
    }

    // Start/update watchers for active mappings.
    for (const mapping of nextMappings) {
      if (mapping.watching === false) continue;

      const watched = folderWatcher.getWatchedFolders().find(w => normalizeLocalPath(w.localPath) === normalizeLocalPath(mapping.localPath));
      const driveName = mapping.driveName || path.basename(mapping.localPath);
      const nextExclusions = mapping.excludePaths || [];

      if (!watched) {
        folderWatcher.watch(mapping.localPath, mapping.driveId, driveName, nextExclusions);
        continue;
      }

      const needsRestart =
        watched.driveId !== mapping.driveId ||
        watched.driveName !== driveName ||
        !areExclusionsEqual(watched.excludePaths || [], nextExclusions);

      if (needsRestart) {
        folderWatcher.unwatch(watched.localPath);
        folderWatcher.watch(mapping.localPath, mapping.driveId, driveName, nextExclusions);
      }
    }
  }

  function createTray() {
    // Use PNG for tray (works on all platforms, ICO can have size issues)
    const isPackaged = app.isPackaged;
    const assetsPath = isPackaged
      ? path.join(process.resourcesPath, 'assets')
      : path.join(__dirname, 'assets');

    // Try multiple icon files - ICO works fine on Windows
    const iconCandidates = ['tray-icon.ico', 'tray-icon.png', 'icon.png', 'rrightclickrr.ico'];
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
            processSyncQueue();
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
              processSyncQueue();
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
      width: 760,
      height: 620,
      minWidth: 760,
      minHeight: 620,
      maxWidth: 760,
      maxHeight: 620,
      resizable: false,
      maximizable: false,
      fullscreenable: false,
      frame: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, 'preload.js')
      },
      icon: path.join(__dirname, 'assets', 'icon.png'),
      title: 'RRightclickrr - Google Drive Sync',
      backgroundColor: '#121212'
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
  let currentSync = null; // Track current sync for cancellation/pause/resume
  let activeSyncJob = null;
  let syncQueue = [];
  let isQueueProcessing = false;

  function normalizeSyncJob(input) {
    const folderPath = input?.folderPath;
    if (!folderPath) return null;
    return {
      id: input.id || `job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      folderPath,
      mode: input.mode === 'copy' ? 'copy' : 'sync',
      onlyFiles: Array.isArray(input.onlyFiles) ? input.onlyFiles : [],
      source: input.source || 'manual',
      createdAt: input.createdAt || new Date().toISOString()
    };
  }

  function persistSyncQueue() {
    store.set('syncQueue', syncQueue.map(job => ({
      id: job.id,
      folderPath: job.folderPath,
      mode: job.mode,
      onlyFiles: job.onlyFiles || [],
      source: job.source || 'manual',
      createdAt: job.createdAt
    })));
  }

  function loadPersistedSyncQueue() {
    const persisted = store.get('syncQueue') || [];
    syncQueue = persisted.map(normalizeSyncJob).filter(Boolean);
  }

  function setActiveSyncSession(job, status = 'running') {
    if (!job) {
      store.set('activeSyncSession', null);
      return;
    }
    store.set('activeSyncSession', {
      id: job.id,
      folderPath: job.folderPath,
      mode: job.mode,
      onlyFiles: job.onlyFiles || [],
      source: job.source || 'manual',
      createdAt: job.createdAt,
      startedAt: new Date().toISOString(),
      status
    });
  }

  function clearActiveSyncSession() {
    store.set('activeSyncSession', null);
  }

  function getSyncRuntimeOptions() {
    const uploadBandwidthLimitKbps = Number(store.get('uploadBandwidthLimitKbps')) || 0;
    return {
      retryMaxAttempts: Number(store.get('retryMaxAttempts')) || 3,
      retryBaseDelayMs: Number(store.get('retryBaseDelayMs')) || 1000,
      retryMaxDelayMs: Number(store.get('retryMaxDelayMs')) || 20000,
      verifyUploads: Boolean(store.get('verifyUploads')),
      verifySampleRate: Number(store.get('verifySampleRate')) || 0,
      bandwidthLimitBytesPerSec: uploadBandwidthLimitKbps > 0 ? uploadBandwidthLimitKbps * 1024 : 0,
      schedule: {
        enabled: Boolean(store.get('uploadScheduleEnabled')),
        start: store.get('uploadScheduleStart') || '00:00',
        end: store.get('uploadScheduleEnd') || '23:59'
      },
      estimatedSpeedBps: Number(store.get('avgUploadSpeedBps')) || 0,
      conflictPolicy: store.get('conflictPolicy') || 'keep-both-local-wins'
    };
  }

  function updateAverageUploadSpeed(result, elapsedMs) {
    const uploadedBytes = Number(result?.preflight?.bytesToUpload) || 0;
    const elapsedSeconds = elapsedMs > 0 ? elapsedMs / 1000 : 0;
    if (uploadedBytes <= 0 || elapsedSeconds <= 0.1) {
      return;
    }
    const observed = uploadedBytes / elapsedSeconds;
    const currentAvg = Number(store.get('avgUploadSpeedBps')) || 0;
    const nextAvg = currentAvg > 0 ? (currentAvg * 0.7) + (observed * 0.3) : observed;
    store.set('avgUploadSpeedBps', Math.max(0, Math.round(nextAvg)));
  }

  function getSyncJobKey(job) {
    const normalizedFolder = normalizeLocalPath(job.folderPath);
    const onlyFiles = (job.onlyFiles || [])
      .map(p => normalizeLocalPath(p))
      .sort()
      .join('|');
    return `${normalizedFolder}|${job.mode}|${onlyFiles}`;
  }

  function enqueueSyncJob(jobInput, options = {}) {
    const job = normalizeSyncJob(jobInput);
    if (!job) return null;

    const key = getSyncJobKey(job);
    const duplicateInQueue = syncQueue.some(existing => getSyncJobKey(existing) === key);
    const duplicateActive = activeSyncJob && getSyncJobKey(activeSyncJob) === key;
    if (duplicateInQueue || duplicateActive) {
      return null;
    }

    if (options.front) {
      syncQueue.unshift(job);
    } else {
      syncQueue.push(job);
    }

    persistSyncQueue();
    updateTrayTooltip();

    const alreadyRunning = Boolean(currentSync);
    if (alreadyRunning && options.notify !== false) {
      showNotification('Sync Queued', `${path.basename(job.folderPath)} added to queue.`);
    }

    processSyncQueue();
    return job;
  }

  function recoverInterruptedSyncSession() {
    loadPersistedSyncQueue();

    const active = store.get('activeSyncSession');
    const autoResume = Boolean(store.get('autoResumeInterruptedSync'));

    if (active && autoResume) {
      const recoveredJob = normalizeSyncJob({
        ...active,
        source: 'recovered'
      });
      if (recoveredJob) {
        syncQueue.unshift(recoveredJob);
      }
    }

    clearActiveSyncSession();
    persistSyncQueue();
  }

  // Handle sync controls from progress window
  ipcMain.on('sync-cancel', () => {
    if (currentSync) {
      currentSync.cancel();
    }
    if (progressWindow && !progressWindow.isDestroyed()) {
      progressWindow.webContents.send('sync-cancelled');
    }
  });

  ipcMain.on('sync-pause', () => {
    if (currentSync) {
      currentSync.pause();
    }
    if (progressWindow && !progressWindow.isDestroyed()) {
      progressWindow.webContents.send('sync-state', { paused: true });
    }
  });

  ipcMain.on('sync-resume', () => {
    if (currentSync) {
      currentSync.resume();
    }
    if (progressWindow && !progressWindow.isDestroyed()) {
      progressWindow.webContents.send('sync-state', { paused: false });
    }
  });

  ipcMain.on('sync-close-window', () => {
    if (progressWindow && !progressWindow.isDestroyed()) {
      progressWindow.close();
    }
  });

  ipcMain.on('sync-retry-failed', () => {
    const lastReport = store.get('lastSyncReport');
    const failedFiles = Array.isArray(lastReport?.failedFiles) ? lastReport.failedFiles : [];
    if (!lastReport?.folderPath || failedFiles.length === 0) {
      if (progressWindow && !progressWindow.isDestroyed()) {
        progressWindow.webContents.send('sync-error', { error: 'No failed files available for retry.' });
      }
      return;
    }

    enqueueSyncJob({
      folderPath: lastReport.folderPath,
      mode: lastReport.mode === 'copy' ? 'copy' : 'sync',
      onlyFiles: failedFiles.map(f => f.localPath).filter(Boolean),
      source: 'retry-failed'
    });

    if (progressWindow && !progressWindow.isDestroyed()) {
      progressWindow.webContents.send('sync-retry-queued', { count: failedFiles.length });
    }
  });

  function createProgressWindow(folderPath, job = null) {
    return new Promise((resolve) => {
      if (progressWindow && !progressWindow.isDestroyed()) {
        progressWindow.close();
      }

      progressWindow = new BrowserWindow({
        width: 560,
        height: 470,
        frame: false,
        transparent: false,
        alwaysOnTop: true,
        resizable: false,
        maximizable: false,
        fullscreenable: false,
        skipTaskbar: true,
        backgroundColor: '#1a1a1a',
        webPreferences: {
          nodeIntegration: true,
          contextIsolation: false
        }
      });

      progressWindow.loadFile(path.join(__dirname, 'src', 'ui', 'progress.html'));
      progressWindow.webContents.on('did-finish-load', () => {
        progressWindow.webContents.send('sync-init', {
          folderPath,
          mode: job?.mode || 'sync',
          source: job?.source || 'manual',
          queueLength: syncQueue.length
        });
        resolve(progressWindow); // Resolve AFTER window is ready
      });

      progressWindow.on('closed', () => {
        progressWindow = null;
      });
    });
  }

  async function runSyncJob(job) {
    if (!googleAuth.isAuthenticated()) {
      showNotification('Not Signed In', 'Please sign in to Google Drive first.');
      createWindow();
      return;
    }

    if (!fs.existsSync(job.folderPath)) {
      showNotification('Sync Skipped', `Folder not found: ${job.folderPath}`);
      return;
    }

    const startedMs = Date.now();
    await createProgressWindow(job.folderPath, job);

    try {
      const folderSync = new FolderSync(driveUploader, store, logDir, syncTracker);
      const existingMapping = (store.get('folderMappings') || []).find(
        m => normalizeLocalPath(m.localPath) === normalizeLocalPath(job.folderPath)
      );
      if (existingMapping?.excludePaths?.length) {
        folderSync.setExcludePaths(existingMapping.excludePaths);
      }

      currentSync = folderSync;
      activeSyncJob = job;
      setActiveSyncSession(job, 'running');

      const runtimeOptions = {
        ...getSyncRuntimeOptions(),
        onlyFiles: job.onlyFiles || []
      };

      const result = await folderSync.syncFolder(job.folderPath, (progress) => {
        if (progressWindow && !progressWindow.isDestroyed()) {
          progressWindow.webContents.send('sync-progress', progress);
        }

        // Update tray tooltip with progress
        if (tray && progress.phase !== 'preflight') {
          const label = job.mode === 'copy' ? 'Copying' : 'Syncing';
          tray.setToolTip(`${label}... ${progress.current}/${progress.total} files`);
        }
      }, runtimeOptions);

      currentSync = null;

      // Check if cancelled
      if (folderSync.cancelled) {
        clearActiveSyncSession();
        updateTrayTooltip();
        return;
      }

      // Track this sync in our database
      if (result.folderId && result.shareLink) {
        syncTracker.trackSync(job.folderPath, result.folderId, result.shareLink, 'folder');

        // Track each uploaded file individually
        if (result.uploadedFiles) {
          for (const file of result.uploadedFiles) {
            syncTracker.trackSync(file.localPath, file.driveId, file.driveUrl, 'file', {
              sizeBytes: Number.isFinite(file.sizeBytes) ? file.sizeBytes : null,
              mtimeMs: Number.isFinite(file.mtimeMs) ? file.mtimeMs : null
            });
          }
        }

        if (job.mode === 'sync') {
          // Add to folder mappings and start watching
          const mappings = store.get('folderMappings') || [];
          const existingIndex = mappings.findIndex(m => normalizeLocalPath(m.localPath) === normalizeLocalPath(job.folderPath));

          if (existingIndex === -1) {
            // Add new mapping
            mappings.push({
              localPath: job.folderPath,
              driveId: result.folderId,
              driveName: path.basename(job.folderPath),
              watching: true
            });
          } else {
            mappings[existingIndex] = {
              ...mappings[existingIndex],
              driveId: result.folderId,
              driveName: path.basename(job.folderPath),
              watching: true
            };
          }
          store.set('folderMappings', mappings);
          syncWatchersWithMappings(mappings);
        }
      }

      if (result.shareLink) {
        clipboard.writeText(result.shareLink);
      }

      const report = {
        jobId: job.id,
        mode: job.mode,
        folderPath: job.folderPath,
        source: job.source || 'manual',
        startedAt: new Date(startedMs).toISOString(),
        completedAt: new Date().toISOString(),
        filesUploaded: result.filesUploaded,
        filesSkipped: result.filesSkipped || 0,
        filesFailed: result.filesFailed || 0,
        totalFiles: result.totalFiles || result.filesUploaded,
        failedFiles: result.failedFiles || [],
        preflight: result.preflight || null,
        conflictCount: result.conflictCount || 0,
        verifyCheckedCount: result.verifyCheckedCount || 0,
        verifyFailedCount: result.verifyFailedCount || 0,
        shareLink: result.shareLink || null
      };
      store.set('lastSyncReport', report);
      updateAverageUploadSpeed(result, Date.now() - startedMs);

      // Show completion in progress window
      if (progressWindow && !progressWindow.isDestroyed()) {
        progressWindow.webContents.send('sync-complete', {
          ...report
        });
      }

      if (job.mode === 'copy') {
        showNotification('Copy Complete', `Copied ${result.filesUploaded} files. Link copied to clipboard.`);
      } else if ((result.filesFailed || 0) > 0) {
        showNotification('Sync Completed With Errors', `${result.filesFailed} file(s) failed. Use Retry Failed.`);
      }

      clearActiveSyncSession();
      updateTrayTooltip();
    } catch (error) {
      safeLog('Sync job failed:', error);
      showNotification(job.mode === 'copy' ? 'Copy Failed' : 'Sync Failed', error.message);

      store.set('lastSyncReport', {
        jobId: job.id,
        mode: job.mode,
        folderPath: job.folderPath,
        source: job.source || 'manual',
        startedAt: new Date(startedMs).toISOString(),
        completedAt: new Date().toISOString(),
        error: error.message,
        failedFiles: []
      });

      if (progressWindow && !progressWindow.isDestroyed()) {
        progressWindow.webContents.send('sync-error', { error: error.message });
      }
      clearActiveSyncSession();
      updateTrayTooltip();
    } finally {
      currentSync = null;
      activeSyncJob = null;
    }
  }

  async function processSyncQueue() {
    if (isQueueProcessing) return;
    if (!googleAuth || !googleAuth.isAuthenticated()) return;

    isQueueProcessing = true;
    try {
      while (syncQueue.length > 0) {
        const job = syncQueue.shift();
        persistSyncQueue();
        await runSyncJob(job);
      }
    } finally {
      isQueueProcessing = false;
      updateTrayTooltip();
    }
  }

  async function handleFolderUpload(folderPath) {
    if (!googleAuth.isAuthenticated()) {
      showNotification('Not Signed In', 'Please sign in to Google Drive first.');
      createWindow();
      return;
    }
    if (!fs.existsSync(folderPath)) {
      showNotification('Sync Failed', `Folder not found: ${folderPath}`);
      return;
    }
    enqueueSyncJob({
      folderPath,
      mode: 'sync',
      source: 'manual'
    });
  }

  // Copy to Google Drive (one-time upload, NO watching)
  async function handleCopyToGdrive(folderPath) {
    if (!googleAuth.isAuthenticated()) {
      showNotification('Not Signed In', 'Please sign in to Google Drive first.');
      createWindow();
      return;
    }
    if (!fs.existsSync(folderPath)) {
      showNotification('Copy Failed', `Folder not found: ${folderPath}`);
      return;
    }
    enqueueSyncJob({
      folderPath,
      mode: 'copy',
      source: 'manual'
    });
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

      // Return the first non-flag argument after the flag.
      for (let i = flagIndex + 1; i < args.length; i++) {
        const arg = args[i];
        if (arg && !arg.startsWith('--') && !arg.startsWith('-')) return arg;
      }
      return null;
    }

    // Look for --sync-folder argument (upload + watch)
    const folderPath = findPathAfterFlag(argv, '--sync-folder');
    if (folderPath) {
      handleFolderUpload(folderPath);
      return;
    }

    // Legacy flag support for older shell extension builds
    const legacySyncPath = findPathAfterFlag(argv, '--sync');
    if (legacySyncPath) {
      handleFolderUpload(legacySyncPath);
      return;
    }

    // Look for --copy-folder argument (upload only, no watching)
    const copyPath = findPathAfterFlag(argv, '--copy-folder');
    if (copyPath) {
      handleCopyToGdrive(copyPath);
      return;
    }

    // Legacy flag support for older shell extension builds
    const legacyCopyPath = findPathAfterFlag(argv, '--copy');
    if (legacyCopyPath) {
      handleCopyToGdrive(legacyCopyPath);
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

  // Window control IPC handlers
  ipcMain.on('window-minimize', () => {
    if (mainWindow) mainWindow.minimize();
  });

  ipcMain.on('window-maximize', () => {
    if (mainWindow) {
      mainWindow.focus();
    }
  });

  ipcMain.on('window-close', () => {
    if (mainWindow) mainWindow.close();
  });

  // IPC Handlers
  ipcMain.handle('get-settings', () => {
    return {
      folderMappings: store.get('folderMappings'),
      autoUpload: store.get('autoUpload'),
      showNotifications: store.get('showNotifications'),
      retryMaxAttempts: store.get('retryMaxAttempts'),
      retryBaseDelayMs: store.get('retryBaseDelayMs'),
      retryMaxDelayMs: store.get('retryMaxDelayMs'),
      verifyUploads: store.get('verifyUploads'),
      verifySampleRate: store.get('verifySampleRate'),
      uploadBandwidthLimitKbps: store.get('uploadBandwidthLimitKbps'),
      uploadScheduleEnabled: store.get('uploadScheduleEnabled'),
      uploadScheduleStart: store.get('uploadScheduleStart'),
      uploadScheduleEnd: store.get('uploadScheduleEnd'),
      autoResumeInterruptedSync: store.get('autoResumeInterruptedSync'),
      conflictPolicy: store.get('conflictPolicy'),
      avgUploadSpeedBps: store.get('avgUploadSpeedBps'),
      queueLength: syncQueue.length,
      activeSyncJob: activeSyncJob ? { ...activeSyncJob } : null,
      isAuthenticated: googleAuth?.isAuthenticated() || false
    };
  });

  ipcMain.handle('save-settings', (event, settings) => {
    if (settings.folderMappings !== undefined) {
      store.set('folderMappings', settings.folderMappings);
      syncWatchersWithMappings(settings.folderMappings);
      updateTrayTooltip();
    }
    if (settings.autoUpload !== undefined) {
      store.set('autoUpload', settings.autoUpload);
    }
    if (settings.showNotifications !== undefined) {
      store.set('showNotifications', settings.showNotifications);
    }
    if (settings.retryMaxAttempts !== undefined) {
      store.set('retryMaxAttempts', Math.max(1, Number(settings.retryMaxAttempts) || 3));
    }
    if (settings.retryBaseDelayMs !== undefined) {
      store.set('retryBaseDelayMs', Math.max(250, Number(settings.retryBaseDelayMs) || 1000));
    }
    if (settings.retryMaxDelayMs !== undefined) {
      store.set('retryMaxDelayMs', Math.max(1000, Number(settings.retryMaxDelayMs) || 20000));
    }
    if (settings.verifyUploads !== undefined) {
      store.set('verifyUploads', Boolean(settings.verifyUploads));
    }
    if (settings.verifySampleRate !== undefined) {
      const value = Number(settings.verifySampleRate);
      store.set('verifySampleRate', Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0.2)));
    }
    if (settings.uploadBandwidthLimitKbps !== undefined) {
      store.set('uploadBandwidthLimitKbps', Math.max(0, Number(settings.uploadBandwidthLimitKbps) || 0));
    }
    if (settings.uploadScheduleEnabled !== undefined) {
      store.set('uploadScheduleEnabled', Boolean(settings.uploadScheduleEnabled));
    }
    if (settings.uploadScheduleStart !== undefined) {
      store.set('uploadScheduleStart', String(settings.uploadScheduleStart || '00:00'));
    }
    if (settings.uploadScheduleEnd !== undefined) {
      store.set('uploadScheduleEnd', String(settings.uploadScheduleEnd || '23:59'));
    }
    if (settings.autoResumeInterruptedSync !== undefined) {
      store.set('autoResumeInterruptedSync', Boolean(settings.autoResumeInterruptedSync));
    }
    if (settings.conflictPolicy !== undefined) {
      store.set('conflictPolicy', String(settings.conflictPolicy || 'keep-both-local-wins'));
    }
    return true;
  });

  ipcMain.handle('stop-watching', async (event, { localPath }) => {
    try {
      if (folderWatcher) {
        folderWatcher.unwatch(localPath);
      }
      updateTrayTooltip();
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('authenticate', async () => {
    try {
      await googleAuth.authenticate();
      updateTrayMenu();
      processSyncQueue();
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

  // === EXCLUSION HANDLERS ===

  ipcMain.handle('add-exclusion', async (event, { localPath, excludePath }) => {
    try {
      // Update the watcher
      if (folderWatcher) {
        folderWatcher.addExclusion(localPath, excludePath);
      }

      // Update the stored mapping
      const mappings = store.get('folderMappings') || [];
      const mapping = mappings.find(m => m.localPath === localPath);
      if (mapping) {
        if (!mapping.excludePaths) {
          mapping.excludePaths = [];
        }
        if (!mapping.excludePaths.includes(excludePath.toLowerCase())) {
          mapping.excludePaths.push(excludePath.toLowerCase());
        }
        store.set('folderMappings', mappings);
      }

      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('remove-exclusion', async (event, { localPath, excludePath }) => {
    try {
      // Update the watcher
      if (folderWatcher) {
        folderWatcher.removeExclusion(localPath, excludePath);
      }

      // Update the stored mapping
      const mappings = store.get('folderMappings') || [];
      const mapping = mappings.find(m => m.localPath === localPath);
      if (mapping && mapping.excludePaths) {
        mapping.excludePaths = mapping.excludePaths.filter(
          p => p.toLowerCase() !== excludePath.toLowerCase()
        );
        store.set('folderMappings', mappings);
      }

      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('get-subfolders', async (event, folderPath) => {
    try {
      const fs = require('fs');
      const subfolders = [];

      const items = fs.readdirSync(folderPath, { withFileTypes: true });
      for (const item of items) {
        if (item.isDirectory() && !item.name.startsWith('.')) {
          subfolders.push(item.name);
        }
      }

      return { success: true, subfolders };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // === DELETE FROM DRIVE HANDLER ===

  ipcMain.handle('delete-from-drive', async (event, { localPath, driveId }) => {
    try {
      if (!googleAuth.isAuthenticated()) {
        return { success: false, error: 'Not authenticated' };
      }

      // Move to trash (safer than permanent delete)
      await driveUploader.trashFile(driveId);

      // Remove from sync tracker
      if (syncTracker) {
        syncTracker.untrackUnderPath(localPath);
      }

      // Remove from folder mappings
      const mappings = store.get('folderMappings') || [];
      const updated = mappings.filter(m => m.localPath !== localPath);
      store.set('folderMappings', updated);

      // Stop watching
      if (folderWatcher) {
        folderWatcher.unwatch(localPath);
      }

      updateTrayMenu();
      updateTrayTooltip();

      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  app.whenReady().then(async () => {
    // Switch to proper logging directory
    initLogging(app);

    // Recover persisted queue/session state from previous run.
    recoverInterruptedSyncSession();

    // Initialize Google Auth
    googleAuth = new GoogleAuth(store);
    await googleAuth.loadTokens(); // Load saved tokens from keytar
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
      if (!store.get('autoUpload')) {
        safeLog('Skipping auto-sync - autoUpload disabled');
        return;
      }

      const { filePath, localPath, driveName, relativePath } = data;
      if (!fs.existsSync(filePath)) {
        return;
      }

      const queued = enqueueSyncJob({
        folderPath: localPath,
        mode: 'sync',
        onlyFiles: [filePath],
        source: 'watcher'
      }, { notify: false });

      if (queued && store.get('showNotifications')) {
        showNotification('File Queued', `${relativePath} queued for sync to ${driveName}`);
      }

      updateTrayTooltip();
    });

    folderWatcher.on('file-deleted', async (data) => {
      const { filePath, relativePath, driveName } = data;
      const tracked = syncTracker ? syncTracker.getSyncInfo(filePath) : null;

      if (tracked?.driveId && googleAuth.isAuthenticated()) {
        try {
          await driveUploader.trashFile(tracked.driveId);
        } catch (error) {
          safeLog('Failed to trash deleted file in Drive:', error.message);
        }
      }

      if (syncTracker) {
        syncTracker.untrack(filePath);
      }

      if (tracked && store.get('showNotifications')) {
        showNotification('File Removed', `${relativePath} removed from ${driveName}`);
      }
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
    syncWatchersWithMappings(mappings);

    createTray();

    // Check for folder argument on startup
    handleArgs(process.argv);

    // Start queue processing if any jobs exist and auth is ready.
    processSyncQueue();

    // Show window on first run
    if (!store.get('hasRunBefore')) {
      store.set('hasRunBefore', true);
      createWindow();
    }
  });

  function updateTrayTooltip() {
    if (!tray) return;
    const watchedCount = folderWatcher ? folderWatcher.getWatchedFolders().length : 0;
    const queuedCount = syncQueue.length;
    if (currentSync && activeSyncJob) {
      const action = activeSyncJob.mode === 'copy' ? 'Copying' : 'Syncing';
      tray.setToolTip(`RRightclickrr - ${action} (${queuedCount} queued)`);
    } else if (watchedCount > 0) {
      const queueSuffix = queuedCount > 0 ? ` | ${queuedCount} queued` : '';
      tray.setToolTip(`RRightclickrr - Watching ${watchedCount} folder${watchedCount > 1 ? 's' : ''}${queueSuffix}`);
    } else if (queuedCount > 0) {
      tray.setToolTip(`RRightclickrr - ${queuedCount} sync job${queuedCount > 1 ? 's' : ''} queued`);
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
