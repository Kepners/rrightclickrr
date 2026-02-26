const Store = require('electron-store');
const path = require('path');
const fs = require('fs');
const os = require('os');

class SyncTracker {
  constructor() {
    this.store = new Store({
      name: 'rrightclickrr-sync-db',
      defaults: {
        syncedItems: {}
      }
    });

    this.overlayIndexPath = path.join(this.getLocalAppDataPath(), 'RRightclickrr', 'synced-paths.txt');
    this.persistSyncedPathIndex();
  }

  /**
   * Record a synced folder or file
   * @param {string} localPath - Full local path
   * @param {string} driveId - Google Drive file/folder ID
   * @param {string} driveUrl - Google Drive web URL
   * @param {string} type - 'folder' or 'file'
   * @param {object|null} metadata - Optional sync metadata (sizeBytes, mtimeMs)
   */
  trackSync(localPath, driveId, driveUrl, type = 'folder', metadata = null) {
    const normalized = this.normalizePath(localPath);
    const syncedItems = this.store.get('syncedItems');
    const existing = syncedItems[normalized] || {};
    const payload = {
      ...existing,
      driveId,
      driveUrl,
      type,
      syncedAt: new Date().toISOString(),
      localPath: localPath
    };

    if (metadata && typeof metadata === 'object') {
      if (Number.isFinite(metadata.sizeBytes)) {
        payload.sizeBytes = metadata.sizeBytes;
      }
      if (Number.isFinite(metadata.mtimeMs)) {
        payload.mtimeMs = metadata.mtimeMs;
      }
      if (typeof metadata.remoteModifiedTime === 'string' && metadata.remoteModifiedTime) {
        payload.remoteModifiedTime = metadata.remoteModifiedTime;
      }
      if (Number.isFinite(metadata.remoteSize)) {
        payload.remoteSize = metadata.remoteSize;
      }
      if (typeof metadata.remoteMd5 === 'string' && metadata.remoteMd5) {
        payload.remoteMd5 = metadata.remoteMd5;
      }
    }

    syncedItems[normalized] = payload;

    this.store.set('syncedItems', syncedItems);
    this.persistSyncedPathIndex();
  }

  /**
   * Bulk record/update synced items with a single store write.
   * @param {Array<object>} entries
   */
  bulkTrackSync(entries = []) {
    if (!Array.isArray(entries) || entries.length === 0) {
      return;
    }

    const syncedItems = this.store.get('syncedItems');

    for (const entry of entries) {
      if (!entry || !entry.localPath || !entry.driveId) {
        continue;
      }

      const normalized = this.normalizePath(entry.localPath);
      const existing = syncedItems[normalized] || {};
      const payload = {
        ...existing,
        driveId: entry.driveId,
        driveUrl: entry.driveUrl || existing.driveUrl || '',
        type: entry.type || existing.type || 'file',
        syncedAt: new Date().toISOString(),
        localPath: entry.localPath
      };

      const metadata = entry.metadata;
      if (metadata && typeof metadata === 'object') {
        if (Number.isFinite(metadata.sizeBytes)) {
          payload.sizeBytes = metadata.sizeBytes;
        }
        if (Number.isFinite(metadata.mtimeMs)) {
          payload.mtimeMs = metadata.mtimeMs;
        }
        if (typeof metadata.remoteModifiedTime === 'string' && metadata.remoteModifiedTime) {
          payload.remoteModifiedTime = metadata.remoteModifiedTime;
        }
        if (Number.isFinite(metadata.remoteSize)) {
          payload.remoteSize = metadata.remoteSize;
        }
        if (typeof metadata.remoteMd5 === 'string' && metadata.remoteMd5) {
          payload.remoteMd5 = metadata.remoteMd5;
        }
      }

      syncedItems[normalized] = payload;
    }

    this.store.set('syncedItems', syncedItems);
    this.persistSyncedPathIndex();
  }

  /**
   * Check whether a file is unchanged since last successful sync.
   * @param {string} localPath - Full local path
   * @param {number} sizeBytes - Current file size
   * @param {number} mtimeMs - Current file modified timestamp
   * @returns {boolean}
   */
  isFileUpToDate(localPath, sizeBytes, mtimeMs) {
    const info = this.getSyncInfo(localPath);
    if (!info || info.type !== 'file' || !info.driveId) {
      return false;
    }
    if (!Number.isFinite(info.sizeBytes) || !Number.isFinite(info.mtimeMs)) {
      return false;
    }
    return info.sizeBytes === sizeBytes && Math.round(info.mtimeMs) === Math.round(mtimeMs);
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
    this.persistSyncedPathIndex();
  }

  /**
   * Remove sync tracking for a folder path and all children
   * @param {string} localPath - Root folder path
   */
  untrackUnderPath(localPath) {
    const normalizedRoot = this.normalizePath(localPath);
    const prefix = normalizedRoot.endsWith(path.sep) ? normalizedRoot : normalizedRoot + path.sep;
    const syncedItems = this.store.get('syncedItems');

    for (const key of Object.keys(syncedItems)) {
      if (key === normalizedRoot || key.startsWith(prefix)) {
        delete syncedItems[key];
      }
    }

    this.store.set('syncedItems', syncedItems);
    this.persistSyncedPathIndex();
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

  getLocalAppDataPath() {
    return process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  }

  persistSyncedPathIndex() {
    try {
      const syncedPaths = this.getAllSyncedPaths();
      fs.mkdirSync(path.dirname(this.overlayIndexPath), { recursive: true });
      fs.writeFileSync(this.overlayIndexPath, syncedPaths.join('\n'), 'utf8');
    } catch {
      // Keep tracker writes non-fatal if index file update fails.
    }
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
