const Store = require('electron-store');
const path = require('path');

class SyncTracker {
  constructor() {
    this.store = new Store({
      name: 'rrightclickrr-sync-db',
      defaults: {
        syncedItems: {}
      }
    });
  }

  /**
   * Record a synced folder or file
   * @param {string} localPath - Full local path
   * @param {string} driveId - Google Drive file/folder ID
   * @param {string} driveUrl - Google Drive web URL
   * @param {string} type - 'folder' or 'file'
   */
  trackSync(localPath, driveId, driveUrl, type = 'folder') {
    const normalized = this.normalizePath(localPath);
    const syncedItems = this.store.get('syncedItems');

    syncedItems[normalized] = {
      driveId,
      driveUrl,
      type,
      syncedAt: new Date().toISOString(),
      localPath: localPath
    };

    this.store.set('syncedItems', syncedItems);
  }

  /**
   * Get sync info for a path
   * @param {string} localPath - Full local path
   * @returns {object|null} Sync info or null if not synced
   */
  getSyncInfo(localPath) {
    const normalized = this.normalizePath(localPath);
    const syncedItems = this.store.get('syncedItems');
    return syncedItems[normalized] || null;
  }

  /**
   * Check if a path is synced
   * @param {string} localPath - Full local path
   * @returns {boolean}
   */
  isSynced(localPath) {
    return this.getSyncInfo(localPath) !== null;
  }

  /**
   * Get the Drive URL for a synced path
   * @param {string} localPath - Full local path
   * @returns {string|null} Drive URL or null
   */
  getDriveUrl(localPath) {
    const info = this.getSyncInfo(localPath);
    return info ? info.driveUrl : null;
  }

  /**
   * Get the Drive ID for a synced path
   * @param {string} localPath - Full local path
   * @returns {string|null} Drive ID or null
   */
  getDriveId(localPath) {
    const info = this.getSyncInfo(localPath);
    return info ? info.driveId : null;
  }

  /**
   * Remove sync tracking for a path
   * @param {string} localPath - Full local path
   */
  untrack(localPath) {
    const normalized = this.normalizePath(localPath);
    const syncedItems = this.store.get('syncedItems');
    delete syncedItems[normalized];
    this.store.set('syncedItems', syncedItems);
  }

  /**
   * Get all synced items
   * @returns {object} All synced items
   */
  getAllSynced() {
    return this.store.get('syncedItems');
  }

  /**
   * Get all synced paths (for overlay icon handler)
   * @returns {string[]} Array of normalized paths
   */
  getAllSyncedPaths() {
    return Object.keys(this.store.get('syncedItems'));
  }

  /**
   * Normalize path for consistent storage
   * @param {string} p - Path to normalize
   * @returns {string} Normalized lowercase path
   */
  normalizePath(p) {
    return path.normalize(p).toLowerCase();
  }

  /**
   * Check if any parent folder is synced (for nested items)
   * @param {string} localPath - Full local path
   * @returns {object|null} Parent sync info or null
   */
  getParentSyncInfo(localPath) {
    let current = localPath;

    while (current) {
      const info = this.getSyncInfo(current);
      if (info) {
        return {
          ...info,
          matchedPath: current,
          relativePath: path.relative(current, localPath)
        };
      }

      const parent = path.dirname(current);
      if (parent === current) break;
      current = parent;
    }

    return null;
  }
}

module.exports = { SyncTracker };
