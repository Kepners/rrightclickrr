const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const { Transform } = require('stream');

class RateLimitTransform extends Transform {
  constructor(bytesPerSecond) {
    super();
    this.bytesPerSecond = Math.max(1, Number(bytesPerSecond) || 1);
    this.nextAllowedTime = Date.now();
    this.pendingTimer = null;
  }

  _transform(chunk, encoding, callback) {
    const now = Date.now();
    const waitMs = Math.max(0, this.nextAllowedTime - now);
    const transmitMs = Math.ceil((chunk.length / this.bytesPerSecond) * 1000);
    this.nextAllowedTime = now + waitMs + transmitMs;

    this.pendingTimer = setTimeout(() => {
      this.pendingTimer = null;
      callback(null, chunk);
    }, waitMs);
  }

  _destroy(error, callback) {
    if (this.pendingTimer) {
      clearTimeout(this.pendingTimer);
      this.pendingTimer = null;
    }
    callback(error);
  }
}

class DriveUploader {
  constructor(googleAuth) {
    this.googleAuth = googleAuth;
    this.drive = null;
    // Track all active upload/download streams so cancel can stop in-flight transfers.
    this.activeTransferStreams = new Set();
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

  trackActiveStream(stream) {
    if (stream && typeof stream.destroy === 'function') {
      this.activeTransferStreams.add(stream);
    }
    return stream;
  }

  untrackActiveStream(stream) {
    if (stream) {
      this.activeTransferStreams.delete(stream);
    }
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
      fields: 'files(id, name, parents, createdTime, webViewLink)',
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

  /**
   * Like ensureFolderPath but also returns the Drive ID + webViewLink for each
   * path segment so callers can track folder→Drive mappings.
   * @returns {{ folderId: string, folderIds: Array<{id: string, webViewLink: string}> }}
   */
  async ensureFolderPathWithIds(folderPath, baseParentId = 'root') {
    const parts = folderPath.split(/[/\\]/).filter(p => p && p !== '');
    let currentParentId = baseParentId;
    const folderIds = [];

    for (const part of parts) {
      const folder = await this.findOrCreateFolder(part, currentParentId);
      folderIds.push({
        id: folder.id,
        webViewLink: folder.webViewLink || `https://drive.google.com/drive/folders/${folder.id}`
      });
      currentParentId = folder.id;
    }

    return { folderId: currentParentId, folderIds };
  }

  async listChildren(parentId) {
    const drive = this.getDrive();
    const files = [];
    let pageToken = undefined;

    do {
      const response = await drive.files.list({
        q: `'${parentId}' in parents and trashed=false`,
        fields: 'nextPageToken, files(id, name, mimeType, modifiedTime, size, md5Checksum, webViewLink)',
        orderBy: 'name',
        pageSize: 1000,
        pageToken
      });

      files.push(...(response.data.files || []));
      pageToken = response.data.nextPageToken || undefined;
    } while (pageToken);

    return files;
  }

  async listFilesRecursive(rootFolderId) {
    const queue = [{ folderId: rootFolderId, relativePath: '' }];
    const files = [];

    while (queue.length > 0) {
      const current = queue.shift();
      const children = await this.listChildren(current.folderId);

      for (const item of children) {
        if (!item?.id || !item?.name) continue;

        const relativePath = current.relativePath
          ? path.posix.join(current.relativePath, item.name)
          : item.name;

        if (item.mimeType === 'application/vnd.google-apps.folder') {
          queue.push({ folderId: item.id, relativePath });
          continue;
        }

        files.push({
          ...item,
          relativePath
        });
      }
    }

    return files;
  }

  async uploadFile(filePath, parentId = 'root', optionsOrAbortSignal = null) {
    const drive = this.getDrive();
    const fileName = path.basename(filePath);
    let abortSignal = null;
    let existingFileId = null;
    let bandwidthLimitBytesPerSec = 0;
    let skipLookup = false;

    if (
      optionsOrAbortSignal &&
      typeof optionsOrAbortSignal === 'object' &&
      ('abortSignal' in optionsOrAbortSignal ||
        'existingFileId' in optionsOrAbortSignal ||
        'bandwidthLimitBytesPerSec' in optionsOrAbortSignal ||
        'skipLookup' in optionsOrAbortSignal)
    ) {
      abortSignal = optionsOrAbortSignal.abortSignal || null;
      existingFileId = optionsOrAbortSignal.existingFileId || null;
      bandwidthLimitBytesPerSec = Number(optionsOrAbortSignal.bandwidthLimitBytesPerSec) || 0;
      skipLookup = Boolean(optionsOrAbortSignal.skipLookup);
    } else {
      abortSignal = optionsOrAbortSignal;
    }

    // Check if file already exists only when the caller has not already resolved it.
    let existingFile = null;
    if (existingFileId) {
      existingFile = { id: existingFileId };
    } else if (!skipLookup) {
      existingFile = await this.findFile(fileName, parentId);
    }

    // Create stream and optionally wrap in a throttle transform.
    const readStream = this.trackActiveStream(fs.createReadStream(filePath));
    let uploadBody = readStream;
    let throttle = null;

    if (bandwidthLimitBytesPerSec > 0) {
      throttle = this.trackActiveStream(new RateLimitTransform(bandwidthLimitBytesPerSec));
      readStream.pipe(throttle);
      uploadBody = throttle;
    }

    // Handle abort signal
    const onAbort = () => {
      this.cancelCurrentUpload();
    };
    if (abortSignal) {
      abortSignal.addEventListener('abort', onAbort, { once: true });
    }

    const media = {
      body: uploadBody
    };

    let response;

    try {
      if (existingFile && existingFile.id) {
        // Update existing file
        try {
          response = await drive.files.update({
            fileId: existingFile.id,
            media: media,
            fields: 'id, name, webViewLink, webContentLink, modifiedTime, size, md5Checksum'
          });
        } catch (error) {
          // If cached file id is stale, recreate in target folder instead of failing the whole sync.
          if (error?.code === 404 || error?.status === 404) {
            response = await drive.files.create({
              requestBody: {
                name: fileName,
                parents: [parentId]
              },
              media: media,
              fields: 'id, name, webViewLink, webContentLink, modifiedTime, size, md5Checksum'
            });
          } else {
            throw error;
          }
        }
      } else {
        // Create new file
        response = await drive.files.create({
          requestBody: {
            name: fileName,
            parents: [parentId]
          },
          media: media,
          fields: 'id, name, webViewLink, webContentLink, modifiedTime, size, md5Checksum'
        });
      }
    } finally {
      if (abortSignal) {
        abortSignal.removeEventListener('abort', onAbort);
      }
      this.untrackActiveStream(readStream);
      this.untrackActiveStream(throttle);
    }

    return response.data;
  }

  // Cancel current upload if one is in progress
  cancelCurrentUpload() {
    for (const stream of Array.from(this.activeTransferStreams)) {
      if (stream && typeof stream.destroy === 'function') {
        try {
          stream.destroy();
        } catch {
          // Ignore destroy failures
        }
      }
    }
  }

  async downloadFile(fileId, destinationPath, abortSignal = null) {
    const drive = this.getDrive();
    await fs.promises.mkdir(path.dirname(destinationPath), { recursive: true });

    const response = await drive.files.get(
      { fileId, alt: 'media' },
      { responseType: 'stream' }
    );

    const readStream = this.trackActiveStream(response.data);
    const writeStream = this.trackActiveStream(fs.createWriteStream(destinationPath));

    return new Promise((resolve, reject) => {
      let settled = false;

      const finalize = (err = null) => {
        if (settled) return;
        settled = true;
        this.untrackActiveStream(readStream);
        this.untrackActiveStream(writeStream);
        if (abortSignal && onAbort) {
          abortSignal.removeEventListener('abort', onAbort);
        }
        if (err) {
          try {
            if (fs.existsSync(destinationPath)) {
              fs.unlinkSync(destinationPath);
            }
          } catch {}
          reject(err);
          return;
        }
        resolve(destinationPath);
      };

      const onAbort = () => {
        this.cancelCurrentUpload();
        finalize(new Error('Download cancelled'));
      };

      if (abortSignal) {
        if (abortSignal.aborted) {
          onAbort();
          return;
        }
        abortSignal.addEventListener('abort', onAbort, { once: true });
      }

      readStream.on('error', finalize);
      writeStream.on('error', finalize);
      writeStream.on('finish', () => finalize(null));

      readStream.pipe(writeStream);
    });
  }

  async findFile(name, parentId = 'root') {
    const drive = this.getDrive();
    const escapedName = this.escapeQueryString(name);
    const response = await drive.files.list({
      q: `name='${escapedName}' and '${parentId}' in parents and trashed=false and mimeType!='application/vnd.google-apps.folder'`,
      fields: 'files(id, name, modifiedTime, size, createdTime, md5Checksum)',
      orderBy: 'createdTime',
      pageSize: 10
    });

    const files = response.data.files;
    if (files.length > 1) {
      console.warn(`Found ${files.length} files named "${name}" in parent ${parentId}, using oldest`);
    }
    return files[0] || null;
  }

  async getFileMetadata(fileId, fields = 'id,name,modifiedTime,size,md5Checksum,parents') {
    const drive = this.getDrive();
    try {
      const response = await drive.files.get({
        fileId,
        fields
      });
      return response.data;
    } catch (error) {
      if (error?.code === 404 || error?.status === 404) {
        return null;
      }
      throw error;
    }
  }

  async copyFile(fileId, newName, parentId = null) {
    const drive = this.getDrive();
    const requestBody = {
      name: newName
    };
    if (parentId) {
      requestBody.parents = [parentId];
    }
    const response = await drive.files.copy({
      fileId,
      requestBody,
      fields: 'id,name,webViewLink,modifiedTime,size,md5Checksum'
    });
    return response.data;
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

  /**
   * Delete a file or folder from Google Drive
   * @param {string} fileId - The ID of the file/folder to delete
   * @returns {Promise<boolean>} - True if deleted successfully
   */
  async deleteFile(fileId) {
    const drive = this.getDrive();
    try {
      await drive.files.delete({
        fileId: fileId
      });
      return true;
    } catch (error) {
      // If file is already gone, that's fine
      if (error.code === 404) {
        return true;
      }
      throw error;
    }
  }

  /**
   * Move a file/folder to trash instead of permanent delete
   * @param {string} fileId - The ID of the file/folder to trash
   * @returns {Promise<boolean>} - True if trashed successfully
   */
  async trashFile(fileId) {
    const drive = this.getDrive();
    try {
      await drive.files.update({
        fileId: fileId,
        requestBody: {
          trashed: true
        }
      });
      return true;
    } catch (error) {
      if (error.code === 404) {
        return true;
      }
      throw error;
    }
  }
}

module.exports = { DriveUploader };
