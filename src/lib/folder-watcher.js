const chokidar = require('chokidar');
const path = require('path');
const { EventEmitter } = require('events');

class FolderWatcher extends EventEmitter {
  constructor() {
    super();
    this.watchers = new Map(); // Map<localPath, watcher>
    this.pendingChanges = new Map(); // Map<filePath, timeout> for debouncing
    this.debounceMs = 2000; // Wait 2 seconds after last change before syncing
  }

  /**
   * Start watching a folder for changes
   * @param {string} localPath - Local folder path to watch
   * @param {string} driveId - Google Drive folder ID to sync to
   * @param {string} driveName - Display name of the Drive folder
   */
  watch(localPath, driveId, driveName) {
    // Don't watch if already watching
    if (this.watchers.has(localPath)) {
      return;
    }

    const watcher = chokidar.watch(localPath, {
      persistent: true,
      ignoreInitial: true, // Don't trigger for existing files
      awaitWriteFinish: {
        stabilityThreshold: 1000,
        pollInterval: 100
      },
      ignored: [
        /(^|[\/\\])\../, // Ignore dotfiles
        /node_modules/,
        /\.git/,
        /\.tmp$/,
        /~$/
      ]
    });

    watcher.on('add', (filePath) => this.handleChange('add', filePath, localPath, driveId, driveName));
    watcher.on('change', (filePath) => this.handleChange('change', filePath, localPath, driveId, driveName));
    watcher.on('error', (error) => this.emit('error', { localPath, error }));

    this.watchers.set(localPath, { watcher, driveId, driveName });
    this.emit('watching', { localPath, driveId, driveName });
  }

  /**
   * Handle a file change with debouncing
   */
  handleChange(type, filePath, localPath, driveId, driveName) {
    // Clear existing timeout for this file
    if (this.pendingChanges.has(filePath)) {
      clearTimeout(this.pendingChanges.get(filePath));
    }

    // Set new timeout to debounce rapid changes
    const timeout = setTimeout(() => {
      this.pendingChanges.delete(filePath);
      this.emit('file-changed', {
        type,
        filePath,
        localPath,
        driveId,
        driveName,
        relativePath: path.relative(localPath, filePath)
      });
    }, this.debounceMs);

    this.pendingChanges.set(filePath, timeout);
  }

  /**
   * Stop watching a folder
   * @param {string} localPath - Local folder path to stop watching
   */
  unwatch(localPath) {
    const entry = this.watchers.get(localPath);
    if (entry) {
      entry.watcher.close();
      this.watchers.delete(localPath);
      this.emit('unwatched', { localPath });
    }
  }

  /**
   * Stop all watchers
   */
  unwatchAll() {
    for (const [localPath, entry] of this.watchers) {
      entry.watcher.close();
    }
    this.watchers.clear();

    // Clear all pending timeouts
    for (const timeout of this.pendingChanges.values()) {
      clearTimeout(timeout);
    }
    this.pendingChanges.clear();
  }

  /**
   * Get list of watched folders
   */
  getWatchedFolders() {
    return Array.from(this.watchers.entries()).map(([localPath, entry]) => ({
      localPath,
      driveId: entry.driveId,
      driveName: entry.driveName
    }));
  }

  /**
   * Check if a folder is being watched
   */
  isWatching(localPath) {
    return this.watchers.has(localPath);
  }
}

module.exports = { FolderWatcher };
