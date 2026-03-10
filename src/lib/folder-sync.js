const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class FolderSync {
  constructor(driveUploader, store, logDir = null, syncTracker = null) {
    this.driveUploader = driveUploader;
    this.store = store;
    this.syncTracker = syncTracker;
    // Use provided logDir or fall back to homedir
    const baseDir = logDir || require('os').homedir();
    this.logFile = path.join(baseDir, 'rrightclickrr-sync.log');
    this.cancelled = false;
    this.paused = false;
    this.abortController = null;
    this.pauseWaiters = [];
    this.excludePaths = []; // Paths to exclude from sync
    this.pendingMetadataBackfills = new Map();
  }

  /**
   * Set paths to exclude from sync
   * @param {string[]} paths - Array of relative paths to exclude
   */
  setExcludePaths(paths) {
    this.excludePaths = (paths || []).map(p => p.toLowerCase());
  }

  cancel() {
    this.cancelled = true;
    this.paused = false;
    this.resolvePauseWaiters();
    this.log('Sync cancelled by user');

    // Abort current upload immediately
    if (this.abortController) {
      this.abortController.abort();
    }

    // Also tell the uploader to cancel current stream
    if (this.driveUploader) {
      this.driveUploader.cancelCurrentUpload();
    }
  }

  pause() {
    if (this.cancelled || this.paused) return;
    this.paused = true;
    this.log('Sync paused by user');
  }

  resume() {
    if (this.cancelled || !this.paused) return;
    this.paused = false;
    this.resolvePauseWaiters();
    this.log('Sync resumed by user');
  }

  log(message) {
    const timestamp = new Date().toISOString();
    const line = `[${timestamp}] ${message}\n`;
    try {
      fs.appendFileSync(this.logFile, line);
    } catch (e) {
      // Ignore log errors
    }
  }

  async syncFolder(localFolderPath, onProgress = null, options = {}) {
    // Reset state for new sync
    this.cancelled = false;
    this.paused = false;
    this.pauseWaiters = [];
    this.abortController = new AbortController();
    this.pendingMetadataBackfills = new Map();
    const runOptions = this.normalizeOptions(options);

    const folderName = path.basename(localFolderPath);
    let files = this.getAllFiles(localFolderPath);

    // If this is a "retry failed only" run, filter to those exact files.
    if (runOptions.onlyFiles.size > 0) {
      files = files.filter(file => runOptions.onlyFiles.has(path.normalize(file).toLowerCase()));
    }

    const totalFiles = files.length;

    // Calculate file metadata upfront for progress tracking + delta sync
    let totalBytes = 0;
    const fileMeta = new Map();
    let bytesToUpload = 0;
    let filesToUpload = 0;
    let newCount = 0;
    let changedCount = 0;
    let skippedPreflightCount = 0;

    for (const file of files) {
      try {
        const stat = fs.statSync(file);
        const size = stat.size;
        const mtimeMs = stat.mtimeMs;
        totalBytes += size;

        const priorSync = this.syncTracker ? this.syncTracker.getSyncInfo(file) : null;
        const state = await this.classifyFileState(file, size, mtimeMs, priorSync);
        fileMeta.set(file, { size, mtimeMs, priorSync, state });

        if (state === 'skip') {
          skippedPreflightCount++;
        } else {
          bytesToUpload += size;
          filesToUpload++;
          if (state === 'new') {
            newCount++;
          } else {
            changedCount++;
          }
        }
      } catch (e) {
        fileMeta.set(file, { size: 0, mtimeMs: 0, priorSync: null, state: 'new' });
        filesToUpload++;
      }
    }

    this.flushLocalMetadataBackfills();

    const preflight = {
      totalFiles,
      totalBytes,
      newFiles: newCount,
      changedFiles: changedCount,
      skippedFiles: skippedPreflightCount,
      bytesToUpload,
      predictedDurationSeconds: runOptions.estimatedSpeedBps > 0
        ? bytesToUpload / runOptions.estimatedSpeedBps
        : null
    };

    this.log(`Syncing folder: ${localFolderPath}`);
    this.log(
      `Preflight: total=${totalFiles}, new=${newCount}, changed=${changedCount}, skipped=${skippedPreflightCount}, upload=${this.formatBytes(bytesToUpload)}`
    );
    if (totalFiles === 0) {
      this.log('WARNING: No files found! Folder may be empty or all files are filtered.');
    }

    // Send preflight summary before uploads begin.
    this.emitProgress(onProgress, {
      phase: 'preflight',
      current: 0,
      total: totalFiles,
      currentFile: null,
      uploadedBytes: 0,
      totalBytes,
      bytesToUpload,
      startTime: Date.now(),
      uploadedCount: 0,
      downloadedCount: 0,
      skippedCount: 0,
      failedCount: 0,
      paused: this.paused,
      preflight
    });

    let processedCount = 0;
    let uploadedCount = 0;
    let downloadedCount = 0;
    let skippedCount = 0;
    let failedCount = 0;
    let conflictCount = 0;
    let verifyCheckedCount = 0;
    let verifyFailedCount = 0;
    let uploadedBytes = 0;
    const startTime = Date.now();
    const uploadedFiles = []; // Track all uploaded files with their Drive IDs
    const downloadedFiles = []; // Track files pulled from Drive to local
    const failedFiles = [];

    // Reuse exact mapping target if it already exists to avoid nested Folder/Folder creation.
    const exactMapping = this.getExactMapping(localFolderPath);
    let rootFolderId;
    if (exactMapping?.driveId) {
      rootFolderId = exactMapping.driveId;
      this.log(`Using existing mapped Drive folder: ${rootFolderId}`);
    } else {
      // Determine the Drive parent folder based on mappings or default
      const driveParentId = await this.getDriveParentForPath(localFolderPath);
      // Create the root folder in Drive
      const rootFolder = await this.driveUploader.findOrCreateFolder(folderName, driveParentId);
      rootFolderId = rootFolder.id;
    }

    // Per-run cache: relativeDir → { folderId, folderIds } to avoid redundant Drive API calls
    // when many files share the same parent directory.
    const ensuredDirCache = new Map();

    const remoteFileCache = new Map();

    const getEnsuredDir = async (relativeDir) => {
      if (!relativeDir || relativeDir === '.') {
        return { folderId: rootFolderId, folderIds: [] };
      }

      if (!ensuredDirCache.has(relativeDir)) {
        const pending = this.driveUploader.ensureFolderPathWithIds(relativeDir, rootFolderId)
          .then(dirResult => {
            this.recordFolderSyncs(localFolderPath, relativeDir, dirResult.folderIds);
            return dirResult;
          })
          .catch(error => {
            ensuredDirCache.delete(relativeDir);
            throw error;
          });
        ensuredDirCache.set(relativeDir, pending);
      }

      return ensuredDirCache.get(relativeDir);
    };

    const getRemoteFilesForParent = async (parentId) => {
      if (!remoteFileCache.has(parentId)) {
        const pending = this.driveUploader.listChildren(parentId)
          .then(children => {
            const byName = new Map();
            for (const item of children || []) {
              if (!item?.id || !item?.name) continue;
              if (item.mimeType === 'application/vnd.google-apps.folder') continue;
              const key = item.name.toLowerCase();
              if (!byName.has(key)) {
                byName.set(key, item);
              }
            }
            return byName;
          })
          .catch(error => {
            remoteFileCache.delete(parentId);
            throw error;
          });
        remoteFileCache.set(parentId, pending);
      }

      return remoteFileCache.get(parentId);
    };

    const rememberRemoteFile = async (parentId, uploadResult) => {
      if (!uploadResult?.id || !uploadResult?.name || !remoteFileCache.has(parentId)) {
        return;
      }
      const byName = await getRemoteFilesForParent(parentId);
      const key = String(uploadResult.name).toLowerCase();
      byName.set(key, {
        ...(byName.get(key) || {}),
        ...uploadResult
      });
    };

    const uploadConcurrency = this.getUploadConcurrency(runOptions, totalFiles);
    let nextFileIndex = 0;

    const getNextFile = () => {
      if (nextFileIndex >= files.length) {
        return null;
      }
      const file = files[nextFileIndex];
      nextFileIndex += 1;
      return file;
    };

    const processFile = async (file) => {
      if (this.cancelled || this.abortController.signal.aborted) {
        return;
      }

      await this.waitForScheduleWindow(runOptions, onProgress, {
        current: processedCount,
        total: totalFiles,
        uploadedBytes,
        totalBytes,
        bytesToUpload,
        startTime,
        uploadedCount,
        downloadedCount,
        skippedCount,
        failedCount
      });
      await this.waitIfPaused();

      const relativePath = path.relative(localFolderPath, file);
      const relativeDir = path.dirname(relativePath);
      const meta = fileMeta.get(file) || { size: 0, mtimeMs: 0, priorSync: null, state: 'new' };
      const fileSize = meta.size || 0;
      const fileMtimeMs = meta.mtimeMs || 0;
      const priorSync = meta.priorSync;

      if (meta.state === 'skip') {
        skippedCount++;
        processedCount++;
        this.log(`Skipping unchanged file: ${relativePath}`);
        this.emitProgress(onProgress, {
          phase: 'upload',
          current: processedCount,
          total: totalFiles,
          currentFile: path.basename(file),
          uploadedBytes,
          totalBytes,
          bytesToUpload,
          startTime,
          uploadedCount,
          downloadedCount,
          skippedCount,
          failedCount,
          paused: this.paused
        });
        return;
      }

      let uploaded = false;
      let lastError = null;

      for (let attempt = 1; attempt <= runOptions.retryMaxAttempts; attempt++) {
        if (this.cancelled || this.abortController.signal.aborted) {
          break;
        }

        await this.waitForScheduleWindow(runOptions, onProgress, {
          current: processedCount,
          total: totalFiles,
          uploadedBytes,
          totalBytes,
          bytesToUpload,
          startTime,
          uploadedCount,
          downloadedCount,
          skippedCount,
          failedCount
        });
        await this.waitIfPaused();

        try {
          const dirResult = await getEnsuredDir(relativeDir);
          const parentId = dirResult.folderId;

          let conflictResolved = false;
          if (priorSync?.driveId) {
            conflictResolved = await this.handleRemoteConflict(
              file,
              path.basename(file),
              fileMtimeMs,
              parentId,
              priorSync,
              runOptions
            );
            if (conflictResolved) {
              conflictCount++;
            }
          }

          let existingFileId = priorSync?.driveId || null;
          if (!existingFileId) {
            try {
              const remoteFiles = await getRemoteFilesForParent(parentId);
              existingFileId = remoteFiles.get(path.basename(file).toLowerCase())?.id || null;
            } catch (lookupError) {
              this.log(`WARNING listing existing files for ${relativePath}: ${lookupError.message}`);
            }
          }

          this.log(`Uploading: ${relativePath} (attempt ${attempt}/${runOptions.retryMaxAttempts})`);

          const uploadResult = await this.driveUploader.uploadFile(file, parentId, {
            abortSignal: this.abortController.signal,
            existingFileId,
            bandwidthLimitBytesPerSec: runOptions.bandwidthLimitBytesPerSec,
            skipLookup: true
          });

          await rememberRemoteFile(parentId, uploadResult);

          const shouldVerify = this.shouldVerifyUpload(runOptions);
          if (shouldVerify) {
            verifyCheckedCount++;
            const verified = await this.verifyUploadedFile(file, uploadResult);
            if (!verified.ok) {
              verifyFailedCount++;
              throw new Error(`Integrity check failed (${verified.reason})`);
            }
          }

          this.log(`Uploaded: ${relativePath} -> ${uploadResult.id}`);

          const driveUrl = uploadResult.webViewLink || `https://drive.google.com/file/d/${uploadResult.id}/view`;

          uploadedFiles.push({
            localPath: file,
            relativePath,
            driveId: uploadResult.id,
            driveUrl,
            sizeBytes: fileSize,
            mtimeMs: fileMtimeMs
          });

          this.recordFileSync(file, uploadResult.id, driveUrl, fileSize, fileMtimeMs, uploadResult);

          uploadedCount++;
          uploadedBytes += fileSize;
          uploaded = true;
          break;
        } catch (uploadError) {
          lastError = uploadError;
          this.log(`ERROR uploading ${relativePath} (attempt ${attempt}): ${uploadError.message}`);

          if (attempt < runOptions.retryMaxAttempts && !this.cancelled && !this.abortController.signal.aborted) {
            const retryDelayMs = this.getRetryDelayMs(
              attempt,
              runOptions.retryBaseDelayMs,
              runOptions.retryMaxDelayMs
            );
            this.emitProgress(onProgress, {
              phase: 'retrying',
              current: processedCount,
              total: totalFiles,
              currentFile: path.basename(file),
              uploadedBytes,
              totalBytes,
              bytesToUpload,
              startTime,
              uploadedCount,
              downloadedCount,
              skippedCount,
              failedCount,
              paused: this.paused,
              retryAttempt: attempt,
              retryMaxAttempts: runOptions.retryMaxAttempts,
              retryDelayMs,
              lastError: uploadError.message
            });
            await this.sleepWithPause(retryDelayMs);
          }
        }
      }

      processedCount++;

      if (!uploaded && !this.cancelled && !this.abortController.signal.aborted) {
        failedCount++;
        failedFiles.push({
          localPath: file,
          relativePath,
          error: lastError ? lastError.message : 'Unknown upload error'
        });
      }

      this.emitProgress(onProgress, {
        phase: 'upload',
        current: processedCount,
        total: totalFiles,
        currentFile: path.basename(file),
        uploadedBytes,
        totalBytes,
        bytesToUpload,
        startTime,
        uploadedCount,
        downloadedCount,
        skippedCount,
        failedCount,
        paused: this.paused
      });
    };

    const workerCount = Math.max(1, Math.min(uploadConcurrency, totalFiles || 1));
    this.log(`Upload concurrency: ${workerCount}`);

    const workers = Array.from({ length: workerCount }, async () => {
      while (!this.cancelled && !this.abortController.signal.aborted) {
        const file = getNextFile();
        if (!file) {
          return;
        }
        await processFile(file);
      }
    });

    await Promise.all(workers);

    // For full sync runs, create any local subdirectories that had no files in them
    // (those would never be created via ensureFolderPath during file uploads).
    if (runOptions.syncMode === 'sync' && runOptions.onlyFiles.size === 0 && !this.cancelled) {
      await this.createEmptyDirsInDrive(localFolderPath, rootFolderId, ensuredDirCache);
    }

    // For full sync runs, also pull Drive-only files to local (missing files only).
    const shouldPullFromDrive =
      runOptions.pullFromDrive === true &&
      runOptions.syncMode === 'sync' &&
      runOptions.onlyFiles.size === 0;
    if (shouldPullFromDrive && !this.cancelled && !this.abortController.signal.aborted) {
      const pullResult = await this.downloadMissingFromDrive(
        localFolderPath,
        rootFolderId,
        onProgress,
        {
          current: processedCount,
          total: totalFiles,
          uploadedBytes,
          totalBytes,
          bytesToUpload,
          startTime,
          uploadedCount,
          downloadedCount,
          skippedCount,
          failedCount
        },
        runOptions
      );

      downloadedCount += pullResult.downloadedCount;
      failedCount += pullResult.failedCount;
      downloadedFiles.push(...pullResult.downloadedFiles);
      failedFiles.push(...pullResult.failedFiles);
    } else if (runOptions.syncMode === 'sync') {
      this.log('Drive pull skipped for this sync run');
    }

    // Get share link for the root folder
    let shareLink = null;
    try {
      shareLink = await this.driveUploader.getFolderLink(rootFolderId);
    } catch (error) {
      // Ignore errors getting share link
    }

    this.log(`Sync complete: ${uploadedCount} uploaded, ${downloadedCount} downloaded, ${skippedCount} skipped, ${failedCount} failed`);
    if (failedFiles.length > 0) {
      this.log(`Failed files:\n${failedFiles.map(f => ` - ${f.relativePath}: ${f.error}`).join('\n')}`);
    }
    this.log(`Folder ID: ${rootFolderId}`);
    this.log(`Share link: ${shareLink || 'none'}`);
    this.log('---');

    return {
      filesUploaded: uploadedCount,
      filesDownloaded: downloadedCount,
      filesSkipped: skippedCount,
      filesFailed: failedCount,
      totalFiles,
      folderId: rootFolderId,
      shareLink,
      uploadedFiles,
      downloadedFiles,
      failedFiles,
      preflight,
      conflictCount,
      verifyCheckedCount,
      verifyFailedCount
    };
  }

  normalizeOptions(options = {}) {
    const onlyFiles = new Set(
      (options.onlyFiles || [])
        .filter(Boolean)
        .map(filePath => path.normalize(filePath).toLowerCase())
    );

    const retryMaxAttempts = Number.isFinite(Number(options.retryMaxAttempts))
      ? Math.max(1, Math.min(10, Math.floor(Number(options.retryMaxAttempts))))
      : 3;
    const retryBaseDelayMs = Number.isFinite(Number(options.retryBaseDelayMs))
      ? Math.max(250, Math.floor(Number(options.retryBaseDelayMs)))
      : 1000;
    const retryMaxDelayMs = Number.isFinite(Number(options.retryMaxDelayMs))
      ? Math.max(retryBaseDelayMs, Math.floor(Number(options.retryMaxDelayMs)))
      : 20000;

    const verifyUploads = Boolean(options.verifyUploads);
    const verifySampleRate = Number.isFinite(Number(options.verifySampleRate))
      ? Math.min(1, Math.max(0, Number(options.verifySampleRate)))
      : 0.2;

    const bandwidthLimitBytesPerSec = Number.isFinite(Number(options.bandwidthLimitBytesPerSec))
      ? Math.max(0, Math.floor(Number(options.bandwidthLimitBytesPerSec)))
      : 0;

    const schedule = options.schedule || {};
    const scheduleEnabled = Boolean(schedule.enabled);
    const scheduleStart = this.normalizeTimeOfDay(schedule.start || '00:00');
    const scheduleEnd = this.normalizeTimeOfDay(schedule.end || '23:59');

    const estimatedSpeedBps = Number.isFinite(Number(options.estimatedSpeedBps))
      ? Math.max(0, Number(options.estimatedSpeedBps))
      : 0;

    const syncMode = options.syncMode === 'copy' ? 'copy' : 'sync';
    const pullFromDrive = Boolean(options.pullFromDrive);

    return {
      onlyFiles,
      syncMode,
      pullFromDrive,
      retryMaxAttempts,
      retryBaseDelayMs,
      retryMaxDelayMs,
      verifyUploads,
      verifySampleRate,
      bandwidthLimitBytesPerSec,
      scheduleEnabled,
      scheduleStart,
      scheduleEnd,
      estimatedSpeedBps,
      conflictPolicy: options.conflictPolicy || 'keep-both-local-wins'
    };
  }

  getUploadConcurrency(options, totalFiles = 0) {
    if ((Number(options?.bandwidthLimitBytesPerSec) || 0) > 0) {
      return 1;
    }
    if (totalFiles <= 1) {
      return 1;
    }
    return Math.min(4, totalFiles);
  }

  async classifyFileState(filePath, sizeBytes, mtimeMs, priorSync) {
    if (!this.syncTracker) return 'new';
    if (!priorSync || !priorSync.driveId) return 'new';
    if (this.shouldSkipFile(filePath, sizeBytes, mtimeMs)) return 'skip';

    // Legacy tracker entries (older app versions) may have drive IDs but no local file metadata.
    // In that case, trust syncedAt as the baseline and backfill size/mtime locally.
    if (!Number.isFinite(priorSync.sizeBytes) || !Number.isFinite(priorSync.mtimeMs)) {
      const syncedAtMs = Date.parse(priorSync.syncedAt || '');
      if (Number.isFinite(syncedAtMs) && mtimeMs <= (syncedAtMs + 2000)) {
        this.backfillLocalSyncMetadata(filePath, priorSync, sizeBytes, mtimeMs);
        return 'skip';
      }
      return 'changed';
    }

    // If only timestamps drifted (common with cloud-managed local folders), verify via MD5 when possible.
    if (
      Number.isFinite(priorSync.sizeBytes) &&
      priorSync.sizeBytes === sizeBytes &&
      typeof priorSync.remoteMd5 === 'string' &&
      priorSync.remoteMd5
    ) {
      try {
        const localMd5 = await this.calculateFileMd5(filePath);
        if (localMd5.toLowerCase() === String(priorSync.remoteMd5).toLowerCase()) {
          this.backfillLocalSyncMetadata(filePath, priorSync, sizeBytes, mtimeMs);
          return 'skip';
        }
      } catch {
        // If hashing fails, fall through to changed.
      }
    }

    return 'changed';
  }

  shouldSkipFile(filePath, sizeBytes, mtimeMs) {
    if (!this.syncTracker) {
      return false;
    }
    return this.syncTracker.isFileUpToDate(filePath, sizeBytes, mtimeMs);
  }

  backfillLocalSyncMetadata(filePath, priorSync, sizeBytes, mtimeMs) {
    if (!this.syncTracker || !priorSync?.driveId) {
      return;
    }
    this.pendingMetadataBackfills.set(path.normalize(filePath).toLowerCase(), {
      localPath: filePath,
      driveId: priorSync.driveId,
      driveUrl: priorSync.driveUrl || '',
      type: 'file',
      metadata: {
        sizeBytes,
        mtimeMs,
        remoteModifiedTime: priorSync.remoteModifiedTime || null,
        remoteSize: Number.isFinite(priorSync.remoteSize) ? priorSync.remoteSize : null,
        remoteMd5: priorSync.remoteMd5 || null
      }
    });
  }

  flushLocalMetadataBackfills() {
    if (!this.syncTracker || !this.pendingMetadataBackfills || this.pendingMetadataBackfills.size === 0) {
      return;
    }

    const entries = Array.from(this.pendingMetadataBackfills.values());
    if (typeof this.syncTracker.bulkTrackSync === 'function') {
      this.syncTracker.bulkTrackSync(entries);
    } else {
      for (const entry of entries) {
        this.syncTracker.trackSync(
          entry.localPath,
          entry.driveId,
          entry.driveUrl,
          entry.type,
          entry.metadata
        );
      }
    }

    this.pendingMetadataBackfills.clear();
  }

  recordFileSync(filePath, driveId, driveUrl, sizeBytes, mtimeMs, uploadResult = null) {
    if (!this.syncTracker) {
      return;
    }
    this.syncTracker.trackSync(filePath, driveId, driveUrl, 'file', {
      sizeBytes,
      mtimeMs,
      remoteModifiedTime: uploadResult?.modifiedTime || null,
      remoteSize: Number.isFinite(Number(uploadResult?.size)) ? Number(uploadResult.size) : null,
      remoteMd5: uploadResult?.md5Checksum || null
    });
  }

  async downloadMissingFromDrive(localFolderPath, rootFolderId, onProgress, state, runOptions) {
    let downloadedCount = 0;
    let failedCount = 0;
    let scannedCount = 0;
    let skippedExistingCount = 0;
    const downloadedFiles = [];
    const failedFiles = [];

    let remoteFiles = [];
    try {
      this.log(`Drive pull: listing remote tree for ${localFolderPath}`);
      remoteFiles = await this.driveUploader.listFilesRecursive(rootFolderId);
    } catch (error) {
      this.log(`ERROR listing Drive files for download pull: ${error.message}`);
      return { downloadedCount, failedCount, scannedCount, skippedExistingCount, downloadedFiles, failedFiles };
    }

    this.log(`Drive pull preflight: scanned ${remoteFiles.length} remote files for missing-local download.`);

    for (const remoteFile of remoteFiles) {
      if (this.cancelled || this.abortController.signal.aborted) {
        break;
      }

      scannedCount++;
      const relativePosixPath = remoteFile?.relativePath || remoteFile?.name || '';
      if (!relativePosixPath) {
        continue;
      }

      const relativePath = relativePosixPath.split('/').join(path.sep);
      if (this.isPathExcluded(relativePath.toLowerCase())) {
        skippedExistingCount++;
        continue;
      }

      const localPath = path.join(localFolderPath, ...relativePosixPath.split('/'));
      if (fs.existsSync(localPath)) {
        skippedExistingCount++;
        continue;
      }

      await this.waitForScheduleWindow(runOptions, onProgress, {
        current: state.current,
        total: state.total,
        uploadedBytes: state.uploadedBytes,
        totalBytes: state.totalBytes,
        bytesToUpload: state.bytesToUpload,
        startTime: state.startTime,
        uploadedCount: state.uploadedCount,
        downloadedCount: state.downloadedCount + downloadedCount,
        skippedCount: state.skippedCount,
        failedCount: state.failedCount + failedCount
      });
      await this.waitIfPaused();

      this.emitProgress(onProgress, {
        phase: 'download',
        current: state.current,
        total: state.total,
        currentFile: path.basename(localPath),
        uploadedBytes: state.uploadedBytes,
        totalBytes: state.totalBytes,
        bytesToUpload: state.bytesToUpload,
        startTime: state.startTime,
        uploadedCount: state.uploadedCount,
        downloadedCount: state.downloadedCount + downloadedCount,
        skippedCount: state.skippedCount,
        failedCount: state.failedCount + failedCount,
        paused: this.paused
      });

      this.log(`Downloading missing remote file: ${relativePath}`);
      try {
        await this.driveUploader.downloadFile(remoteFile.id, localPath, this.abortController.signal);

        const remoteModifiedMs = Date.parse(remoteFile?.modifiedTime || '');
        if (Number.isFinite(remoteModifiedMs)) {
          const when = new Date(remoteModifiedMs);
          fs.utimesSync(localPath, when, when);
        }

        const stat = fs.statSync(localPath);
        const driveUrl = remoteFile.webViewLink || `https://drive.google.com/file/d/${remoteFile.id}/view`;

        this.recordFileSync(localPath, remoteFile.id, driveUrl, stat.size, stat.mtimeMs, {
          modifiedTime: remoteFile.modifiedTime || null,
          size: remoteFile.size || null,
          md5Checksum: remoteFile.md5Checksum || null
        });

        downloadedFiles.push({
          localPath,
          relativePath,
          driveId: remoteFile.id,
          driveUrl,
          sizeBytes: stat.size,
          mtimeMs: stat.mtimeMs
        });
        downloadedCount++;
      } catch (error) {
        failedCount++;
        failedFiles.push({
          localPath,
          relativePath,
          error: error.message
        });
        this.log(`ERROR downloading missing remote file ${relativePath}: ${error.message}`);
      }
    }

    this.log(
      `Drive pull complete: ${downloadedCount} downloaded, ${skippedExistingCount} already local/excluded, ${failedCount} failed`
    );

    return { downloadedCount, failedCount, scannedCount, skippedExistingCount, downloadedFiles, failedFiles };
  }

  emitProgress(onProgress, data) {
    if (!onProgress) {
      return;
    }

    const elapsedSeconds = Math.max((Date.now() - data.startTime) / 1000, 0.001);
    const bytesPerSecond = data.uploadedBytes > 0 ? data.uploadedBytes / elapsedSeconds : 0;
    const remainingBytes = Math.max(data.bytesToUpload - data.uploadedBytes, 0);
    const etaSeconds = bytesPerSecond > 0 ? remainingBytes / bytesPerSecond : null;

    onProgress({
      phase: data.phase || 'upload',
      current: data.current,
      total: data.total,
      currentFile: data.currentFile,
      uploadedBytes: data.uploadedBytes,
      totalBytes: data.totalBytes,
      bytesToUpload: data.bytesToUpload,
      remainingBytes,
      bytesPerSecond,
      etaSeconds,
      estimatedCompletion: etaSeconds !== null ? new Date(Date.now() + etaSeconds * 1000).toISOString() : null,
      uploadedCount: data.uploadedCount,
      downloadedCount: data.downloadedCount || 0,
      skippedCount: data.skippedCount,
      failedCount: data.failedCount,
      paused: Boolean(data.paused),
      preflight: data.preflight || null,
      retryAttempt: data.retryAttempt || null,
      retryMaxAttempts: data.retryMaxAttempts || null,
      retryDelayMs: data.retryDelayMs || null,
      lastError: data.lastError || null,
      scheduleWaitingUntil: data.scheduleWaitingUntil || null
    });
  }

  async waitIfPaused() {
    while (this.paused && !this.cancelled && !(this.abortController && this.abortController.signal.aborted)) {
      await new Promise(resolve => this.pauseWaiters.push(resolve));
    }
  }

  resolvePauseWaiters() {
    while (this.pauseWaiters.length > 0) {
      const resolve = this.pauseWaiters.shift();
      resolve();
    }
  }

  async sleepWithPause(ms) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      if (this.cancelled || (this.abortController && this.abortController.signal.aborted)) {
        return;
      }
      await this.waitIfPaused();
      const remaining = end - Date.now();
      const step = Math.min(250, Math.max(1, remaining));
      await new Promise(resolve => setTimeout(resolve, step));
    }
  }

  getRetryDelayMs(attempt, baseDelayMs, maxDelayMs) {
    const exponential = baseDelayMs * Math.pow(2, Math.max(0, attempt - 1));
    const jitter = Math.floor(Math.random() * Math.max(100, Math.floor(baseDelayMs / 2)));
    return Math.min(maxDelayMs, exponential + jitter);
  }

  shouldVerifyUpload(options) {
    if (!options.verifyUploads) {
      return false;
    }
    if (options.verifySampleRate >= 1) {
      return true;
    }
    return Math.random() < options.verifySampleRate;
  }

  async verifyUploadedFile(localPath, uploadResult) {
    try {
      const localSize = fs.statSync(localPath).size;
      const remoteSize = Number(uploadResult?.size);
      if (Number.isFinite(remoteSize) && remoteSize !== localSize) {
        return { ok: false, reason: `size mismatch local=${localSize} remote=${remoteSize}` };
      }

      const remoteMd5 = uploadResult?.md5Checksum;
      if (remoteMd5) {
        const localMd5 = await this.calculateFileMd5(localPath);
        if (localMd5.toLowerCase() !== String(remoteMd5).toLowerCase()) {
          return { ok: false, reason: 'md5 mismatch' };
        }
        return { ok: true };
      }

      // Fallback if md5 isn't available (for some Drive file types).
      if (uploadResult?.id) {
        const remoteMeta = await this.driveUploader.getFileMetadata(uploadResult.id, 'id,size');
        const fallbackRemoteSize = Number(remoteMeta?.size);
        if (Number.isFinite(fallbackRemoteSize) && fallbackRemoteSize !== localSize) {
          return { ok: false, reason: `fallback size mismatch local=${localSize} remote=${fallbackRemoteSize}` };
        }
      }

      return { ok: true };
    } catch (error) {
      return { ok: false, reason: error.message };
    }
  }

  calculateFileMd5(filePath) {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('md5');
      const stream = fs.createReadStream(filePath);
      stream.on('data', chunk => hash.update(chunk));
      stream.on('error', reject);
      stream.on('end', () => resolve(hash.digest('hex')));
    });
  }

  async handleRemoteConflict(localPath, fileName, localMtimeMs, parentId, priorSync, options) {
    if (!priorSync?.driveId || !priorSync.remoteModifiedTime || !Number.isFinite(priorSync.mtimeMs)) {
      return false;
    }

    const remoteMeta = await this.driveUploader.getFileMetadata(
      priorSync.driveId,
      'id,name,modifiedTime,parents,size,md5Checksum'
    );

    if (!remoteMeta?.id || !remoteMeta.modifiedTime) {
      return false;
    }

    const lastKnownRemoteMs = Date.parse(priorSync.remoteModifiedTime);
    const currentRemoteMs = Date.parse(remoteMeta.modifiedTime);
    if (!Number.isFinite(lastKnownRemoteMs) || !Number.isFinite(currentRemoteMs)) {
      return false;
    }

    const localChangedSinceLastSync = localMtimeMs > Math.round(priorSync.mtimeMs) + 1000;
    const remoteChangedSinceLastSync = currentRemoteMs > lastKnownRemoteMs + 1000;
    if (!localChangedSinceLastSync || !remoteChangedSinceLastSync) {
      return false;
    }

    if (options.conflictPolicy !== 'keep-both-local-wins') {
      return false;
    }

    const conflictCopyName = this.buildConflictCopyName(fileName);
    await this.driveUploader.copyFile(priorSync.driveId, conflictCopyName, parentId);
    this.log(`Conflict detected for ${localPath}. Preserved remote as "${conflictCopyName}"`);
    return true;
  }

  buildConflictCopyName(fileName) {
    const ext = path.extname(fileName);
    const base = path.basename(fileName, ext);
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    return `${base}.remote-conflict-${stamp}${ext}`;
  }

  async waitForScheduleWindow(options, onProgress, state) {
    if (!options.scheduleEnabled) {
      return;
    }

    while (!this.isWithinScheduleWindow(new Date(), options.scheduleStart, options.scheduleEnd)) {
      if (this.cancelled || (this.abortController && this.abortController.signal.aborted)) {
        return;
      }
      const nextStart = this.getNextScheduleWindowStart(new Date(), options.scheduleStart, options.scheduleEnd);
      this.emitProgress(onProgress, {
        phase: 'scheduled-wait',
        current: state.current,
        total: state.total,
        currentFile: null,
        uploadedBytes: state.uploadedBytes,
        totalBytes: state.totalBytes,
        bytesToUpload: state.bytesToUpload,
        startTime: state.startTime,
        uploadedCount: state.uploadedCount,
        downloadedCount: state.downloadedCount || 0,
        skippedCount: state.skippedCount,
        failedCount: state.failedCount,
        paused: this.paused,
        scheduleWaitingUntil: nextStart ? nextStart.toISOString() : null
      });
      await this.sleepWithPause(10000);
    }
  }

  normalizeTimeOfDay(value) {
    const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || '').trim());
    if (!match) return '00:00';
    const hour = Math.max(0, Math.min(23, Number(match[1])));
    const minute = Math.max(0, Math.min(59, Number(match[2])));
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  }

  toMinutesOfDay(value) {
    const [hour, minute] = this.normalizeTimeOfDay(value).split(':').map(Number);
    return hour * 60 + minute;
  }

  isWithinScheduleWindow(now, startTime, endTime) {
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const start = this.toMinutesOfDay(startTime);
    const end = this.toMinutesOfDay(endTime);

    if (start === end) {
      return true; // full day
    }

    if (start < end) {
      return nowMinutes >= start && nowMinutes < end;
    }

    // Overnight window (e.g. 22:00 -> 06:00)
    return nowMinutes >= start || nowMinutes < end;
  }

  getNextScheduleWindowStart(now, startTime, endTime) {
    const start = this.toMinutesOfDay(startTime);
    const end = this.toMinutesOfDay(endTime);
    const nowMinutes = now.getHours() * 60 + now.getMinutes();

    const next = new Date(now);
    next.setSeconds(0, 0);

    if (start === end) {
      return next;
    }

    if (start < end) {
      if (nowMinutes < start) {
        next.setHours(Math.floor(start / 60), start % 60, 0, 0);
        return next;
      }
      next.setDate(next.getDate() + 1);
      next.setHours(Math.floor(start / 60), start % 60, 0, 0);
      return next;
    }

    // Overnight window: out-of-window only happens in [end, start).
    if (nowMinutes >= end && nowMinutes < start) {
      next.setHours(Math.floor(start / 60), start % 60, 0, 0);
      return next;
    }

    return next;
  }

  getAllFiles(dirPath, arrayOfFiles = [], basePath = null) {
    // Track base path for exclusion checking
    if (basePath === null) {
      basePath = dirPath;
    }

    let files = [];
    try {
      files = fs.readdirSync(dirPath);
    } catch {
      return arrayOfFiles;
    }

    files.forEach(file => {
      const fullPath = path.join(dirPath, file);
      let stat = null;
      try {
        stat = fs.statSync(fullPath);
      } catch {
        return;
      }

      // Check if this path is excluded
      const relativePath = path.relative(basePath, fullPath).toLowerCase();
      if (this.isPathExcluded(relativePath)) {
        return; // Skip excluded paths
      }

      if (stat.isDirectory()) {
        // Skip hidden folders and system folders
        if (!file.startsWith('.') && !this.isSystemFolder(file)) {
          this.getAllFiles(fullPath, arrayOfFiles, basePath);
        }
      } else {
        // Skip hidden files and system files
        if (!file.startsWith('.') && !this.isSystemFile(file)) {
          arrayOfFiles.push(fullPath);
        }
      }
    });

    return arrayOfFiles;
  }

  /**
   * Check if a path is in the exclusion list
   */
  isPathExcluded(relativePath) {
    if (this.excludePaths.length === 0) {
      return false;
    }

    const normalizedPath = relativePath.toLowerCase();
    for (const excluded of this.excludePaths) {
      if (normalizedPath === excluded || normalizedPath.startsWith(excluded + path.sep)) {
        return true;
      }
    }
    return false;
  }

  isSystemFolder(name) {
    const systemFolders = [
      'node_modules',
      '__pycache__',
      '.git',
      '.svn',
      '.hg',
      'Thumbs.db',
      '.DS_Store',
      '$RECYCLE.BIN',
      'System Volume Information'
    ];
    return systemFolders.includes(name);
  }

  isSystemFile(name) {
    const systemFiles = [
      'desktop.ini',
      'Thumbs.db',
      '.DS_Store'
    ];
    return systemFiles.includes(name);
  }

  /**
   * Record Drive folder IDs for each segment of a synced relative directory path.
   * This allows dir-deleted handlers to look up the Drive folder ID later.
   */
  recordFolderSyncs(localFolderPath, relativeDir, folderIds) {
    if (!this.syncTracker || !folderIds || folderIds.length === 0) return;
    const parts = relativeDir.split(/[/\\]/).filter(p => p);
    parts.forEach((part, i) => {
      if (!folderIds[i]) return;
      const localDirPath = path.join(localFolderPath, ...parts.slice(0, i + 1));
      this.syncTracker.trackSync(
        localDirPath,
        folderIds[i].id,
        folderIds[i].webViewLink,
        'folder'
      );
    });
  }

  /**
   * Collect all subdirectories recursively, respecting the same exclusion and
   * hidden-folder rules as getAllFiles.
   */
  getAllDirectories(dirPath, arrayOfDirs = [], basePath = null) {
    if (basePath === null) basePath = dirPath;

    let entries = [];
    try {
      entries = fs.readdirSync(dirPath);
    } catch {
      return arrayOfDirs;
    }

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry);
      let stat = null;
      try {
        stat = fs.statSync(fullPath);
      } catch {
        continue;
      }
      if (!stat.isDirectory()) continue;
      if (entry.startsWith('.') || this.isSystemFolder(entry)) continue;
      const relativePath = path.relative(basePath, fullPath).toLowerCase();
      if (this.isPathExcluded(relativePath)) continue;
      arrayOfDirs.push(fullPath);
      this.getAllDirectories(fullPath, arrayOfDirs, basePath);
    }

    return arrayOfDirs;
  }

  /**
   * Create any local subdirectories that have no files anywhere in their subtree.
   * These are invisible to the file-upload loop but must still exist in Drive.
   * Skips dirs already processed by the file upload loop (via ensuredDirCache).
   */
  async createEmptyDirsInDrive(localFolderPath, rootFolderId, ensuredDirCache) {
    const allDirs = this.getAllDirectories(localFolderPath);

    for (const dir of allDirs) {
      if (this.cancelled) break;

      const relativeDir = path.relative(localFolderPath, dir);
      if (!relativeDir || relativeDir === '.') continue;

      // Already handled by a file upload
      if (ensuredDirCache.has(relativeDir)) continue;

      // Check if ANY file exists anywhere in this subtree
      const hasFiles = this.getAllFiles(dir).length > 0;
      if (hasFiles) {
        // Non-empty: its files will trigger ensureFolderPath via the upload loop.
        // We still want to record the Drive folder ID for this dir so we can trash
        // it later if it's deleted locally. But only do this if not already cached.
        continue;
      }

      // Truly empty subtree — explicitly create in Drive
      try {
        const dirResult = await this.driveUploader.ensureFolderPathWithIds(relativeDir, rootFolderId);
        ensuredDirCache.set(relativeDir, dirResult);
        this.recordFolderSyncs(localFolderPath, relativeDir, dirResult.folderIds);
        this.log(`Created empty dir in Drive: ${relativeDir} -> ${dirResult.folderId}`);
      } catch (e) {
        this.log(`ERROR creating empty dir ${relativeDir}: ${e.message}`);
      }
    }
  }

  formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  getExactMapping(localPath) {
    const mappings = this.store.get('folderMappings') || [];
    const normalized = path.normalize(localPath).toLowerCase();
    return mappings.find(m => path.normalize(m.localPath).toLowerCase() === normalized) || null;
  }

  async getDriveParentForPath(localPath) {
    const mappings = this.store.get('folderMappings') || [];

    // Check if this path or any parent is mapped
    let currentPath = localPath;
    while (currentPath) {
      const mapping = mappings.find(m =>
        m.localPath.toLowerCase() === currentPath.toLowerCase()
      );
      if (mapping) {
        // Calculate relative path from mapping root
        const relativePath = path.relative(mapping.localPath, localPath);
        if (relativePath && relativePath !== path.basename(localPath)) {
          // Need to create intermediate folders
          const parentPath = path.dirname(relativePath);
          if (parentPath && parentPath !== '.') {
            return await this.driveUploader.ensureFolderPath(parentPath, mapping.driveId);
          }
        }
        return mapping.driveId;
      }

      const parentPath = path.dirname(currentPath);
      if (parentPath === currentPath) break;
      currentPath = parentPath;
    }

    // No mapping found, use root
    return 'root';
  }
}

module.exports = { FolderSync };
