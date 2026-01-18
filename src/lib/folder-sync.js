const fs = require('fs');
const path = require('path');

class FolderSync {
  constructor(driveUploader, store) {
    this.driveUploader = driveUploader;
    this.store = store;
  }

  async syncFolder(localFolderPath, onProgress = null) {
    const folderName = path.basename(localFolderPath);
    const files = this.getAllFiles(localFolderPath);
    const totalFiles = files.length;
    let uploadedCount = 0;

    // Determine the Drive parent folder based on mappings or default
    const driveParentId = await this.getDriveParentForPath(localFolderPath);

    // Create the root folder in Drive
    const rootFolder = await this.driveUploader.findOrCreateFolder(folderName, driveParentId);
    const rootFolderId = rootFolder.id;

    // Upload all files maintaining structure
    for (const file of files) {
      const relativePath = path.relative(localFolderPath, file);
      const relativeDir = path.dirname(relativePath);

      // Ensure folder structure exists in Drive
      let parentId = rootFolderId;
      if (relativeDir && relativeDir !== '.') {
        parentId = await this.driveUploader.ensureFolderPath(relativeDir, rootFolderId);
      }

      // Upload the file
      await this.driveUploader.uploadFile(file, parentId);

      uploadedCount++;
      if (onProgress) {
        onProgress({
          current: uploadedCount,
          total: totalFiles,
          currentFile: path.basename(file)
        });
      }
    }

    // Get share link for the root folder
    let shareLink = null;
    try {
      shareLink = await this.driveUploader.getFolderLink(rootFolderId);
    } catch (error) {
      console.error('Could not get share link:', error);
    }

    return {
      filesUploaded: uploadedCount,
      folderId: rootFolderId,
      shareLink: shareLink
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
