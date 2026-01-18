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
const testSyncBtn = document.getElementById('testSyncBtn');

let settings = {
  folderMappings: [],
  autoUpload: true,
  showNotifications: true,
  isAuthenticated: false
};

// Initialize
async function init() {
  settings = await window.api.getSettings();
  updateAuthUI();
  renderMappings();
  showNotifications.checked = settings.showNotifications;
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

  mappingsList.innerHTML = settings.folderMappings.map((mapping, index) => `
    <div class="mapping-item" data-index="${index}">
      <div class="mapping-info">
        <div class="mapping-local">${mapping.localPath}</div>
        <div class="mapping-drive">${mapping.driveName || 'My Drive'}</div>
      </div>
      <div class="mapping-actions">
        <button class="btn-icon delete" title="Remove mapping" data-action="delete">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M4 4l8 8M4 12l8-8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
        </button>
      </div>
    </div>
  `).join('');

  // Add event listeners to delete buttons
  mappingsList.querySelectorAll('.btn-icon.delete').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const item = e.target.closest('.mapping-item');
      const index = parseInt(item.dataset.index);
      deleteMapping(index);
    });
  });
}

async function deleteMapping(index) {
  settings.folderMappings.splice(index, 1);
  await window.api.saveSettings({ folderMappings: settings.folderMappings });
  renderMappings();
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
  registerMenuBtn.disabled = true;
  registerMenuBtn.textContent = 'Registering...';

  const result = await window.api.registerContextMenu();

  if (result.success) {
    alert('Right-click menu enabled! You may need to restart Explorer or reboot for changes to take effect.');
  } else {
    alert('Failed to register: ' + result.error);
  }

  registerMenuBtn.disabled = false;
  registerMenuBtn.textContent = 'Enable Right-Click Menu';
});

unregisterMenuBtn.addEventListener('click', async () => {
  const result = await window.api.unregisterContextMenu();

  if (result.success) {
    alert('Right-click menu disabled.');
  } else {
    alert('Failed to unregister: ' + result.error);
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

// Test sync handler
testSyncBtn.addEventListener('click', async () => {
  if (!settings.isAuthenticated) {
    alert('Please sign in to Google Drive first.');
    return;
  }

  const result = await window.api.selectLocalFolder();
  if (result.success) {
    testSyncBtn.disabled = true;
    testSyncBtn.textContent = 'Syncing...';

    await window.api.testSync(result.path);

    testSyncBtn.disabled = false;
    testSyncBtn.textContent = 'Select Folder & Sync';
  }
});

// Close modal on outside click
addMappingModal.addEventListener('click', (e) => {
  if (e.target === addMappingModal) {
    addMappingModal.classList.add('hidden');
  }
});

// Initialize app
init();
