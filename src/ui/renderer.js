// DOM Elements
const authStatus = document.getElementById('authStatus');
const statusDot = authStatus.querySelector('.status-dot');
const statusText = authStatus.querySelector('.status-text');
const signInView = document.getElementById('signInView');
const signedInView = document.getElementById('signedInView');
const signInBtn = document.getElementById('signInBtn');
const signOutBtn = document.getElementById('signOutBtn');
const registerMenuBtn = document.getElementById('registerMenuBtn');
const unregisterMenuBtn = document.getElementById('unregisterMenuBtn');
const contextMenuStatus = document.getElementById('contextMenuStatus');
const mappingsList = document.getElementById('mappingsList');
const addMappingBtn = document.getElementById('addMappingBtn');
const addMappingModal = document.getElementById('addMappingModal');
const localFolderInput = document.getElementById('localFolderInput');
const browseLocalBtn = document.getElementById('browseLocalBtn');
const driveFolderSelect = document.getElementById('driveFolderSelect');
const refreshDriveFoldersBtn = document.getElementById('refreshDriveFoldersBtn');
const cancelMappingBtn = document.getElementById('cancelMappingBtn');
const saveMappingBtn = document.getElementById('saveMappingBtn');
const showNotifications = document.getElementById('showNotifications');
const verifyUploads = document.getElementById('verifyUploads');
const uploadScheduleEnabled = document.getElementById('uploadScheduleEnabled');
const autoResumeInterruptedSync = document.getElementById('autoResumeInterruptedSync');
const retryMaxAttempts = document.getElementById('retryMaxAttempts');
const verifySampleRatePercent = document.getElementById('verifySampleRatePercent');
const uploadBandwidthLimitKbps = document.getElementById('uploadBandwidthLimitKbps');
const uploadScheduleStart = document.getElementById('uploadScheduleStart');
const uploadScheduleEnd = document.getElementById('uploadScheduleEnd');

let settings = {
  folderMappings: [],
  autoUpload: true,
  showNotifications: true,
  retryMaxAttempts: 3,
  verifyUploads: true,
  verifySampleRate: 0.2,
  uploadBandwidthLimitKbps: 0,
  uploadScheduleEnabled: false,
  uploadScheduleStart: '00:00',
  uploadScheduleEnd: '23:59',
  autoResumeInterruptedSync: true,
  isAuthenticated: false
};

// Initialize
async function init() {
  settings = await window.api.getSettings();
  updateAuthUI();
  updateContextMenuUI();
  renderMappings();
  showNotifications.checked = settings.showNotifications;
  verifyUploads.checked = settings.verifyUploads !== false;
  uploadScheduleEnabled.checked = settings.uploadScheduleEnabled === true;
  autoResumeInterruptedSync.checked = settings.autoResumeInterruptedSync !== false;
  retryMaxAttempts.value = settings.retryMaxAttempts || 3;
  verifySampleRatePercent.value = Math.round((settings.verifySampleRate || 0) * 100);
  uploadBandwidthLimitKbps.value = settings.uploadBandwidthLimitKbps || 0;
  uploadScheduleStart.value = settings.uploadScheduleStart || '00:00';
  uploadScheduleEnd.value = settings.uploadScheduleEnd || '23:59';
  applySettingControlState();
}

function applySettingControlState() {
  verifySampleRatePercent.disabled = !verifyUploads.checked;
  uploadScheduleStart.disabled = !uploadScheduleEnabled.checked;
  uploadScheduleEnd.disabled = !uploadScheduleEnabled.checked;
}

async function updateContextMenuUI() {
  const isRegistered = await window.api.isContextMenuRegistered();
  if (isRegistered) {
    registerMenuBtn.textContent = 'Right-Click Menu Enabled';
    registerMenuBtn.classList.add('registered');
    contextMenuStatus.textContent = 'Active! Right-click any folder -> "Show more options" -> RRightclickrr.';
    contextMenuStatus.style.color = '#4C956C';
  } else {
    registerMenuBtn.textContent = 'Enable Right-Click Menu';
    registerMenuBtn.classList.remove('registered');
    contextMenuStatus.textContent = 'After enabling, right-click any folder -> "Show more options" -> find RRightclickrr options.';
    contextMenuStatus.style.color = '';
  }

  registerMenuBtn.disabled = false;
}

function updateAuthUI() {
  if (settings.isAuthenticated) {
    statusDot.classList.add('connected');
    statusText.textContent = 'Connected';
    signInView.classList.add('hidden');
    signedInView.classList.remove('hidden');
  } else {
    statusDot.classList.remove('connected');
    statusText.textContent = 'Not signed in';
    signInView.classList.remove('hidden');
    signedInView.classList.add('hidden');
  }
}

function renderMappings() {
  if (!settings.folderMappings || settings.folderMappings.length === 0) {
    mappingsList.innerHTML = `
      <div class="empty-state">
        <p>No folder mappings yet. Add one to sync specific folders.</p>
      </div>
    `;
    return;
  }

  mappingsList.innerHTML = settings.folderMappings.map((mapping, index) => {
    const excludeCount = (mapping.excludePaths || []).length;
    const excludeText = excludeCount > 0 ? `<span class="exclude-badge">${excludeCount} excluded</span>` : '';

    return `
    <div class="mapping-item" data-index="${index}">
      <div class="mapping-info">
        <div class="mapping-local">${mapping.localPath} ${excludeText}</div>
        <div class="mapping-drive">${mapping.driveName || 'My Drive'}</div>
      </div>
      <div class="mapping-actions">
        <button class="btn-icon" title="Manage exclusions" data-action="exclude">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="2" stroke-linecap="round" transform="rotate(45 8 8)"/>
          </svg>
        </button>
        <button class="btn-icon delete-drive" title="Delete from Google Drive" data-action="delete-drive">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M2 4h12M5 4V3a1 1 0 011-1h4a1 1 0 011 1v1M6 7v5M10 7v5M3 4l1 9a1 1 0 001 1h6a1 1 0 001-1l1-9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
        <button class="btn-icon delete" title="Stop watching (keep on Drive)" data-action="delete">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M4 4l8 8M4 12l8-8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
        </button>
      </div>
    </div>
  `}).join('');

  // Add event listeners
  mappingsList.querySelectorAll('.btn-icon').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const item = e.target.closest('.mapping-item');
      const index = parseInt(item.dataset.index);
      const action = e.target.closest('button').dataset.action;

      if (action === 'delete') {
        deleteMapping(index);
      } else if (action === 'delete-drive') {
        deleteFromDrive(index);
      } else if (action === 'exclude') {
        openExclusionModal(index);
      }
    });
  });
}

async function deleteMapping(index) {
  const mapping = settings.folderMappings[index];
  if (mapping) {
    await window.api.stopWatching(mapping.localPath);
  }
  settings.folderMappings.splice(index, 1);
  await window.api.saveSettings({ folderMappings: settings.folderMappings });
  renderMappings();
}

async function deleteFromDrive(index) {
  const mapping = settings.folderMappings[index];
  if (!mapping) return;

  const confirmDelete = confirm(
    `Delete "${mapping.driveName}" from Google Drive?\n\n` +
    `This will move the folder to your Google Drive trash.\n` +
    `You can restore it from trash within 30 days.`
  );

  if (!confirmDelete) return;

  const result = await window.api.deleteFromDrive(mapping.localPath, mapping.driveId);

  if (result.success) {
    settings.folderMappings.splice(index, 1);
    renderMappings();
    alert('Folder moved to Google Drive trash.');
  } else {
    alert('Failed to delete: ' + result.error);
  }
}

// Exclusion management
let currentExclusionIndex = null;

async function openExclusionModal(index) {
  currentExclusionIndex = index;
  const mapping = settings.folderMappings[index];

  const modal = document.getElementById('exclusionModal');
  const folderName = document.getElementById('exclusionFolderName');
  const subfolderList = document.getElementById('subfolderList');

  folderName.textContent = mapping.localPath;

  // Load subfolders
  subfolderList.innerHTML = '<div class="loading">Loading subfolders...</div>';
  modal.classList.remove('hidden');

  const result = await window.api.getSubfolders(mapping.localPath);

  if (result.success) {
    const excludePaths = (mapping.excludePaths || []).map(p => p.toLowerCase());

    if (result.subfolders.length === 0) {
      subfolderList.innerHTML = '<div class="empty-state"><p>No subfolders found.</p></div>';
    } else {
      subfolderList.innerHTML = result.subfolders.map(folder => {
        const isExcluded = excludePaths.includes(folder.toLowerCase());
        return `
          <label class="subfolder-item ${isExcluded ? 'excluded' : ''}">
            <input type="checkbox" ${isExcluded ? 'checked' : ''} data-folder="${folder}">
            <span class="folder-name">${folder}</span>
            <span class="folder-status">${isExcluded ? 'Excluded' : 'Syncing'}</span>
          </label>
        `;
      }).join('');

      // Add event listeners
      subfolderList.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
        checkbox.addEventListener('change', async (e) => {
          const folder = e.target.dataset.folder;
          const item = e.target.closest('.subfolder-item');

          if (e.target.checked) {
            await window.api.addExclusion(mapping.localPath, folder);
            item.classList.add('excluded');
            item.querySelector('.folder-status').textContent = 'Excluded';
          } else {
            await window.api.removeExclusion(mapping.localPath, folder);
            item.classList.remove('excluded');
            item.querySelector('.folder-status').textContent = 'Syncing';
          }

          // Update local settings
          settings = await window.api.getSettings();
          renderMappings();
        });
      });
    }
  } else {
    subfolderList.innerHTML = '<div class="empty-state"><p>Failed to load subfolders.</p></div>';
  }
}

function closeExclusionModal() {
  const modal = document.getElementById('exclusionModal');
  modal.classList.add('hidden');
  currentExclusionIndex = null;
}

// Auth handlers
signInBtn.addEventListener('click', async () => {
  signInBtn.disabled = true;
  signInBtn.textContent = 'Signing in...';

  const result = await window.api.authenticate();

  if (result.success) {
    settings.isAuthenticated = true;
    updateAuthUI();
  } else {
    alert('Sign in failed: ' + result.error);
  }

  signInBtn.disabled = false;
  signInBtn.innerHTML = `
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path d="M19.6 10.2c0-.7-.1-1.4-.2-2H10v3.8h5.4c-.2 1.2-1 2.3-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.3z" fill="#4285F4"/>
      <path d="M10 20c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.2H1.1v2.6C2.7 17.8 6.1 20 10 20z" fill="#34A853"/>
      <path d="M4.4 11.9c-.2-.6-.3-1.2-.3-1.9s.1-1.3.3-1.9V5.5H1.1C.4 6.9 0 8.4 0 10s.4 3.1 1.1 4.5l3.3-2.6z" fill="#FBBC05"/>
      <path d="M10 3.9c1.5 0 2.8.5 3.8 1.5l2.9-2.9C15 .9 12.7 0 10 0 6.1 0 2.7 2.2 1.1 5.5l3.3 2.6c.8-2.4 3-4.2 5.6-4.2z" fill="#EA4335"/>
    </svg>
    Sign in with Google
  `;
});

signOutBtn.addEventListener('click', async () => {
  await window.api.signOut();
  settings.isAuthenticated = false;
  updateAuthUI();
});

// Context menu handlers
registerMenuBtn.addEventListener('click', async () => {
  if (registerMenuBtn.disabled) return;

  registerMenuBtn.disabled = true;
  registerMenuBtn.textContent = 'Registering...';

  try {
    const result = await Promise.race([
      window.api.registerContextMenu(),
      new Promise((resolve) => {
        setTimeout(() => resolve({ success: false, error: 'Registration timed out. Please try again.' }), 20000);
      })
    ]);

    if (!result.success) {
      alert('Failed to register: ' + result.error);
    }
  } catch (error) {
    alert('Failed to register: ' + (error?.message || String(error)));
  } finally {
    await updateContextMenuUI();
  }
});

unregisterMenuBtn.addEventListener('click', async () => {
  try {
    const result = await window.api.unregisterContextMenu();
    if (!result.success) {
      alert('Failed to unregister: ' + result.error);
    }
  } catch (error) {
    alert('Failed to unregister: ' + (error?.message || String(error)));
  } finally {
    await updateContextMenuUI();
  }
});

// Mapping modal handlers
addMappingBtn.addEventListener('click', () => {
  if (!settings.isAuthenticated) {
    alert('Please sign in to Google Drive first.');
    return;
  }
  localFolderInput.value = '';
  addMappingModal.classList.remove('hidden');
  loadDriveFolders();
});

cancelMappingBtn.addEventListener('click', () => {
  addMappingModal.classList.add('hidden');
});

browseLocalBtn.addEventListener('click', async () => {
  const result = await window.api.selectLocalFolder();
  if (result.success) {
    localFolderInput.value = result.path;
  }
});

refreshDriveFoldersBtn.addEventListener('click', loadDriveFolders);

async function loadDriveFolders() {
  driveFolderSelect.innerHTML = '<option value="root">Loading...</option>';

  const result = await window.api.getDriveFolders();

  if (result.success) {
    driveFolderSelect.innerHTML = '<option value="root">My Drive (Root)</option>';
    result.folders.forEach(folder => {
      const option = document.createElement('option');
      option.value = folder.id;
      option.textContent = folder.name;
      driveFolderSelect.appendChild(option);
    });
  } else {
    driveFolderSelect.innerHTML = '<option value="root">My Drive (Root)</option>';
  }
}

saveMappingBtn.addEventListener('click', async () => {
  const localPath = localFolderInput.value;
  const driveId = driveFolderSelect.value;
  const driveName = driveFolderSelect.options[driveFolderSelect.selectedIndex].text;

  if (!localPath) {
    alert('Please select a local folder.');
    return;
  }

  settings.folderMappings.push({
    localPath,
    driveId,
    driveName
  });

  await window.api.saveSettings({ folderMappings: settings.folderMappings });
  renderMappings();
  addMappingModal.classList.add('hidden');
});

// Settings handlers
showNotifications.addEventListener('change', async () => {
  settings.showNotifications = showNotifications.checked;
  await window.api.saveSettings({ showNotifications: settings.showNotifications });
});

async function saveSyncSettings() {
  const retryParsed = parseInt(retryMaxAttempts.value || '3', 10);
  settings.retryMaxAttempts = Math.max(1, Math.min(10, Number.isFinite(retryParsed) ? retryParsed : 3));
  settings.verifyUploads = verifyUploads.checked;
  const sampleParsed = parseFloat(verifySampleRatePercent.value || '0');
  const sampleRate = Number.isFinite(sampleParsed) ? sampleParsed / 100 : 0.2;
  settings.verifySampleRate = Math.max(0, Math.min(1, sampleRate));
  const bandwidthParsed = parseInt(uploadBandwidthLimitKbps.value || '0', 10);
  settings.uploadBandwidthLimitKbps = Math.max(0, Number.isFinite(bandwidthParsed) ? bandwidthParsed : 0);
  settings.uploadScheduleEnabled = uploadScheduleEnabled.checked;
  settings.uploadScheduleStart = uploadScheduleStart.value || '00:00';
  settings.uploadScheduleEnd = uploadScheduleEnd.value || '23:59';
  settings.autoResumeInterruptedSync = autoResumeInterruptedSync.checked;

  await window.api.saveSettings({
    retryMaxAttempts: settings.retryMaxAttempts,
    verifyUploads: settings.verifyUploads,
    verifySampleRate: settings.verifySampleRate,
    uploadBandwidthLimitKbps: settings.uploadBandwidthLimitKbps,
    uploadScheduleEnabled: settings.uploadScheduleEnabled,
    uploadScheduleStart: settings.uploadScheduleStart,
    uploadScheduleEnd: settings.uploadScheduleEnd,
    autoResumeInterruptedSync: settings.autoResumeInterruptedSync
  });
}

verifyUploads.addEventListener('change', async () => {
  applySettingControlState();
  await saveSyncSettings();
});

uploadScheduleEnabled.addEventListener('change', async () => {
  applySettingControlState();
  await saveSyncSettings();
});

autoResumeInterruptedSync.addEventListener('change', saveSyncSettings);
retryMaxAttempts.addEventListener('change', saveSyncSettings);
verifySampleRatePercent.addEventListener('change', saveSyncSettings);
uploadBandwidthLimitKbps.addEventListener('change', saveSyncSettings);
uploadScheduleStart.addEventListener('change', saveSyncSettings);
uploadScheduleEnd.addEventListener('change', saveSyncSettings);

// Close modal on outside click
addMappingModal.addEventListener('click', (e) => {
  if (e.target === addMappingModal) {
    addMappingModal.classList.add('hidden');
  }
});

// Close exclusion modal on button click
document.getElementById('closeExclusionBtn').addEventListener('click', closeExclusionModal);

// Close exclusion modal on outside click
document.getElementById('exclusionModal').addEventListener('click', (e) => {
  if (e.target.id === 'exclusionModal') {
    closeExclusionModal();
  }
});

// Window controls
document.getElementById('minimizeBtn').addEventListener('click', () => window.api.minimizeWindow());
document.getElementById('maximizeBtn').style.display = 'none';
document.getElementById('closeBtn').addEventListener('click', () => window.api.closeWindow());

// Initialize app
init();
