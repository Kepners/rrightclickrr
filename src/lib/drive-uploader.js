const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

class DriveUploader {
  constructor(googleAuth) {
    this.googleAuth = googleAuth;
    this.drive = null;
    this.currentUploadStream = null; // Track for cancellation
  }

  getDrive() {
    if (!this.drive) {
      this.drive = google.drive({
        version: 'v3',
        auth: this.googleAuth.getClient()
      });
    }
    return this.drive;
  }

  // Escape special characters for Drive query
  escapeQueryString(str) {
    // Drive API uses single quotes for strings - escape single quotes and backslashes
    return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  }

  async listFolders(parentId = 'root') {
    const drive = this.getDrive();
    const response = await drive.files.list({
      q: `mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`,
      fields: 'files(id, name, parents)',
      orderBy: 'name'
    });
    return response.data.files;
  }

  async findFolder(name, parentId = 'root') {
    const drive = this.getDrive();
    const escapedName = this.escapeQueryString(name);
    const response = await drive.files.list({
      q: `mimeType='application/vnd.google-apps.folder' and name='${escapedName}' and '${parentId}' in parents and trashed=false`,
      fields: 'files(id, name, parents, createdTime)',
      orderBy: 'createdTime', // Pick oldest if duplicates exist
      pageSize: 10 // Get a few in case of duplicates
    });

    const files = response.data.files;
    if (files.length > 1) {
      // Log warning about duplicates - pick oldest (first in list due to orderBy)
      console.warn(`Found ${files.length} folders named "${name}" in parent ${parentId}, using oldest`);
    }
    return files[0] || null;
  }

  async createFolder(name, parentId = 'root') {
    const drive = this.getDrive();
    const response = await drive.files.create({
      requestBody: {
        name: name,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [parentId]
      },
      fields: 'id, name, webViewLink'
    });
    return response.data;
  }

  async findOrCreateFolder(name, parentId = 'root') {
    let folder = await this.findFolder(name, parentId);
    if (!folder) {
      folder = await this.createFolder(name, parentId);
    }
    return folder;
  }

  async ensureFolderPath(folderPath, baseParentId = 'root') {
    const parts = folderPath.split(/[/\\]/).filter(p => p && p !== '');
    let currentParentId = baseParentId;

    for (const part of parts) {
      const folder = await this.findOrCreateFolder(part, currentParentId);
      currentParentId = folder.id;
    }

    return currentParentId;
  }

  async uploadFile(filePath, parentId = 'root', abortSignal = null) {
    const drive = this.getDrive();
    const fileName = path.basename(filePath);
    const fileSize = fs.statSync(filePath).size;

    // Check if file already exists
    const existingFile = await this.findFile(fileName, parentId);

    // Create stream and track it for cancellation
    const readStream = fs.createReadStream(filePath);
    this.currentUploadStream = readStream;

    // Handle abort signal
    if (abortSignal) {
      abortSignal.addEventListener('abort', () => {
        readStream.destroy();
      }, { once: true });
    }

    const media = {
      body: readStream
    };

    let response;

    try {
      if (existingFile) {
        // Update existing file
        response = await drive.files.update({
          fileId: existingFile.id,
          media: media,
          fields: 'id, name, webViewLink, webContentLink'
        });
      } else {
        // Create new file
        response = await drive.files.create({
          requestBody: {
            name: fileName,
            parents: [parentId]
          },
          media: media,
          fields: 'id, name, webViewLink, webContentLink'
        });
      }
    } finally {
      this.currentUploadStream = null;
    }

    return response.data;
  }

  // Cancel current upload if one is in progress
  cancelCurrentUpload() {
    if (this.currentUploadStream) {
      this.currentUploadStream.destroy();
      this.currentUploadStream = null;
    }
  }

  async findFile(name, parentId = 'root') {
    const drive = this.getDrive();
    const escapedName = this.escapeQueryString(name);
    const response = await drive.files.list({
      q: `name='${escapedName}' and '${parentId}' in parents and trashed=false and mimeType!='application/vnd.google-apps.folder'`,
      fields: 'files(id, name, modifiedTime, size, createdTime)',
      orderBy: 'createdTime',
      pageSize: 10
    });

    const files = response.data.files;
    if (files.length > 1) {
      console.warn(`Found ${files.length} files named "${name}" in parent ${parentId}, using oldest`);
    }
    return files[0] || null;
  }

  async getShareLink(fileId) {
    const drive = this.getDrive();

    // Set file to be viewable by anyone with link
    await drive.permissions.create({
      fileId: fileId,
      requestBody: {
        role: 'reader',
        type: 'anyone'
      }
    });

    // Get the updated file with web links
    const response = await drive.files.get({
      fileId: fileId,
      fields: 'webViewLink, webContentLink'
    });

    return response.data.webViewLink;
  }

  async getFolderLink(folderId) {
    const drive = this.getDrive();
    const response = await drive.files.get({
      fileId: folderId,
      fields: 'webViewLink'
    });
    return response.data.webViewLink;
  }
}

module.exports = { DriveUploader };
