const chokidar = require('chokidar');
const path = require('path');
const { EventEmitter } = require('events');

class FolderWatcher extends EventEmitter {
  constructor() {
    super();
    this.watchers = new Map(); // Map<localPath, watcher>
    this.pendingChanges = new Map(); // Map<filePath, timeout> for debouncing
    this.debounceMs = 2000; // Wait 2 seconds after last change before syncing
    this.excludedPaths = new Map(); // Map<localPath, Set<excludedSubpath>>
  }

  /**
   * Start watching a folder for changes
   * @param {string} localPath - Local folder path to watch
   * @param {string} driveId - Google Drive folder ID to sync to
   * @param {string} driveName - Display name of the Drive folder
   * @param {string[]} excludePaths - Array of subpaths to exclude from syncing
   */
  watch(localPath, driveId, driveName, excludePaths = []) {
    // Don't watch if already watching
    if (this.watchers.has(localPath)) {
      return;
    }

    // Store excluded paths
    this.excludedPaths.set(localPath, new Set(excludePaths.map(p => p.toLowerCase())));

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
    watcher.on('unlink', (filePath) => this.handleDelete(filePath, localPath, driveId, driveName));
    watcher.on('error', (error) => this.emit('error', { localPath, error }));

    this.watchers.set(localPath, { watcher, driveId, driveName });
    this.emit('watching', { localPath, driveId, driveName });
  }

  /**
   * Handle a file change with debouncing
   */
  handleChange(type, filePath, localPath, driveId, driveName) {
    // Check if this file is in an excluded path
    if (this.isExcluded(filePath, localPath)) {
      return; // Skip excluded files
    }

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
   * Handle file deletion
   */
  handleDelete(filePath, localPath, driveId, driveName) {
    if (this.isExcluded(filePath, localPath)) {
      return;
    }

    this.emit('file-deleted', {
      filePath,
      localPath,
      driveId,
      driveName,
      relativePath: path.relative(localPath, filePath)
    });
  }

  /**
   * Check if a file path is in an excluded subfolder
   */
  isExcluded(filePath, localPath) {
    const excludeSet = this.excludedPaths.get(localPath);
    if (!excludeSet || excludeSet.size === 0) {
      return false;
    }

    const relativePath = path.relative(localPath, filePath).toLowerCase();

    // Check if the relative path starts with any excluded path
    for (const excluded of excludeSet) {
      if (relativePath === excluded || relativePath.startsWith(excluded + path.sep)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Add an exclusion to a watched folder
   * @param {string} localPath - The watched folder path
   * @param {string} excludePath - The subpath to exclude (relative to localPath)
   */
  addExclusion(localPath, excludePath) {
    if (!this.excludedPaths.has(localPath)) {
      this.excludedPaths.set(localPath, new Set());
    }
    this.excludedPaths.get(localPath).add(excludePath.toLowerCase());
  }

  /**
   * Remove an exclusion from a watched folder
   * @param {string} localPath - The watched folder path
   * @param {string} excludePath - The subpath to un-exclude
   */
  removeExclusion(localPath, excludePath) {
    const excludeSet = this.excludedPaths.get(localPath);
    if (excludeSet) {
      excludeSet.delete(excludePath.toLowerCase());
    }
  }

  /**
   * Get all exclusions for a watched folder
   * @param {string} localPath - The watched folder path
   * @returns {string[]} - Array of excluded subpaths
   */
  getExclusions(localPath) {
    const excludeSet = this.excludedPaths.get(localPath);
    return excludeSet ? Array.from(excludeSet) : [];
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
      this.excludedPaths.delete(localPath); // Clean up exclusions
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
    this.excludedPaths.clear();

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
      driveName: entry.driveName,
      excludePaths: this.getExclusions(localPath)
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
