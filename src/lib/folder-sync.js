const fs = require('fs');
const path = require('path');

class FolderSync {
  constructor(driveUploader, store, logDir = null) {
    this.driveUploader = driveUploader;
    this.store = store;
    // Use provided logDir or fall back to homedir
    const baseDir = logDir || require('os').homedir();
    this.logFile = path.join(baseDir, 'rrightclickrr-sync.log');
    this.cancelled = false;
    this.abortController = null;
  }

  cancel() {
    this.cancelled = true;
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

  log(message) {
    const timestamp = new Date().toISOString();
    const line = `[${timestamp}] ${message}\n`;
    try {
      fs.appendFileSync(this.logFile, line);
    } catch (e) {
      // Ignore log errors
    }
  }

  async syncFolder(localFolderPath, onProgress = null) {
    // Reset state for new sync
    this.cancelled = false;
    this.abortController = new AbortController();

    const folderName = path.basename(localFolderPath);
    const files = this.getAllFiles(localFolderPath);
    const totalFiles = files.length;

    // Calculate total bytes upfront for progress tracking
    let totalBytes = 0;
    const fileSizes = new Map();
    for (const file of files) {
      try {
        const size = fs.statSync(file).size;
        fileSizes.set(file, size);
        totalBytes += size;
      } catch (e) {
        fileSizes.set(file, 0);
      }
    }

    // Debug: log what we found
    this.log(`Syncing folder: ${localFolderPath}`);
    this.log(`Found ${totalFiles} files to upload (${this.formatBytes(totalBytes)} total)`);
    if (totalFiles === 0) {
      this.log(`WARNING: No files found! Folder may be empty or all files are filtered.`);
    }
    let uploadedCount = 0;
    let uploadedBytes = 0;
    const startTime = Date.now();
    const uploadedFiles = []; // Track all uploaded files with their Drive IDs

    // Determine the Drive parent folder based on mappings or default
    const driveParentId = await this.getDriveParentForPath(localFolderPath);

    // Create the root folder in Drive
    const rootFolder = await this.driveUploader.findOrCreateFolder(folderName, driveParentId);
    const rootFolderId = rootFolder.id;

    // Upload all files maintaining structure
    for (const file of files) {
      // Check for cancellation before each file
      if (this.cancelled || this.abortController.signal.aborted) {
        this.log('Sync cancelled - stopping upload loop');
        break;
      }

      const relativePath = path.relative(localFolderPath, file);
      const relativeDir = path.dirname(relativePath);
      const fileSize = fileSizes.get(file) || 0;

      try {
        // Ensure folder structure exists in Drive
        let parentId = rootFolderId;
        if (relativeDir && relativeDir !== '.') {
          parentId = await this.driveUploader.ensureFolderPath(relativeDir, rootFolderId);
        }

        this.log(`Uploading: ${relativePath}`);

        // Upload the file with abort signal for immediate cancellation
        const uploadResult = await this.driveUploader.uploadFile(file, parentId, this.abortController.signal);

        this.log(`Uploaded: ${relativePath} -> ${uploadResult.id}`);

        // Track this file
        uploadedFiles.push({
          localPath: file,
          driveId: uploadResult.id,
          driveUrl: uploadResult.webViewLink || `https://drive.google.com/file/d/${uploadResult.id}/view`
        });

        uploadedCount++;
        uploadedBytes += fileSize;

        // Calculate transfer speed
        const elapsedSeconds = (Date.now() - startTime) / 1000;
        const bytesPerSecond = elapsedSeconds > 0 ? uploadedBytes / elapsedSeconds : 0;

        if (onProgress) {
          onProgress({
            current: uploadedCount,
            total: totalFiles,
            currentFile: path.basename(file),
            uploadedBytes: uploadedBytes,
            totalBytes: totalBytes,
            bytesPerSecond: bytesPerSecond
          });
        }
      } catch (uploadError) {
        this.log(`ERROR uploading ${relativePath}: ${uploadError.message}`);
        // Continue with next file instead of failing entirely
      }
    }

    // Get share link for the root folder
    let shareLink = null;
    try {
      shareLink = await this.driveUploader.getFolderLink(rootFolderId);
    } catch (error) {
      // Ignore errors getting share link
    }

    this.log(`Sync complete: ${uploadedCount}/${totalFiles} files uploaded`);
    this.log(`Folder ID: ${rootFolderId}`);
    this.log(`Share link: ${shareLink || 'none'}`);
    this.log('---');

    return {
      filesUploaded: uploadedCount,
      folderId: rootFolderId,
      shareLink: shareLink,
      uploadedFiles: uploadedFiles // Include all file info
    };
  }

  getAllFiles(dirPath, arrayOfFiles = []) {
    const files = fs.readdirSync(dirPath);

    files.forEach(file => {
      const fullPath = path.join(dirPath, file);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        // Skip hidden folders and system folders
        if (!file.startsWith('.') && !this.isSystemFolder(file)) {
          this.getAllFiles(fullPath, arrayOfFiles);
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

  formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
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
