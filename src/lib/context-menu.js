const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

const APP_NAME = 'RRightclickrr';
const VERB_SYNC = 'SyncToGoogleDrive';
const VERB_GET_URL = 'GetGDriveUrl';

async function runPowerShell(script) {
  return new Promise((resolve, reject) => {
    const escapedScript = script.replace(/"/g, '\\"');
    exec(`powershell -ExecutionPolicy Bypass -Command "${escapedScript}"`, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || error.message));
      } else {
        resolve(stdout);
      }
    });
  });
}

async function registerContextMenu() {
  const exePath = process.execPath;
  const appPath = path.dirname(exePath);
  const syncIconPath = path.join(appPath, 'resources', 'app', 'assets', 'sync-icon.ico');
  const urlIconPath = path.join(appPath, 'resources', 'app', 'assets', 'link-icon.ico');

  // For development, use different paths
  const isDev = !process.execPath.includes('RRightclickrr.exe');
  const actualSyncIconPath = isDev
    ? path.join(__dirname, '..', '..', 'assets', 'sync-icon.ico')
    : syncIconPath;
  const actualUrlIconPath = isDev
    ? path.join(__dirname, '..', '..', 'assets', 'link-icon.ico')
    : urlIconPath;

  const syncCommand = `"${exePath}" --sync-folder "%V"`;
  const getUrlCommand = `"${exePath}" --get-url "%V"`;

  // Registry script to add context menu for directories (folders)
  const script = `
    # ============================================
    # SYNC TO GOOGLE DRIVE - Context Menu Item
    # ============================================

    # Add to Directory context menu (right-click on folder)
    $syncPath = "HKCU:\\Software\\Classes\\Directory\\shell\\${VERB_SYNC}"

    # Create main key
    New-Item -Path $syncPath -Force | Out-Null
    Set-ItemProperty -Path $syncPath -Name "(Default)" -Value "Sync to Google Drive"
    Set-ItemProperty -Path $syncPath -Name "Icon" -Value "${actualSyncIconPath.replace(/\\/g, '\\\\')}"
    Set-ItemProperty -Path $syncPath -Name "Position" -Value "Top"

    # Create command subkey
    New-Item -Path "$syncPath\\command" -Force | Out-Null
    Set-ItemProperty -Path "$syncPath\\command" -Name "(Default)" -Value '${syncCommand.replace(/'/g, "''")}'

    # Add to Directory Background (right-click in empty space in folder)
    $bgSyncPath = "HKCU:\\Software\\Classes\\Directory\\Background\\shell\\${VERB_SYNC}"
    New-Item -Path $bgSyncPath -Force | Out-Null
    Set-ItemProperty -Path $bgSyncPath -Name "(Default)" -Value "Sync this folder to Google Drive"
    Set-ItemProperty -Path $bgSyncPath -Name "Icon" -Value "${actualSyncIconPath.replace(/\\/g, '\\\\')}"

    New-Item -Path "$bgSyncPath\\command" -Force | Out-Null
    Set-ItemProperty -Path "$bgSyncPath\\command" -Name "(Default)" -Value '${syncCommand.replace(/'/g, "''")}'

    # ============================================
    # GET GOOGLE DRIVE URL - Context Menu Item
    # ============================================

    # Add to Directory context menu (right-click on folder)
    $urlPath = "HKCU:\\Software\\Classes\\Directory\\shell\\${VERB_GET_URL}"

    New-Item -Path $urlPath -Force | Out-Null
    Set-ItemProperty -Path $urlPath -Name "(Default)" -Value "Get Google Drive URL"
    Set-ItemProperty -Path $urlPath -Name "Icon" -Value "${actualUrlIconPath.replace(/\\/g, '\\\\')}"

    # Create command subkey
    New-Item -Path "$urlPath\\command" -Force | Out-Null
    Set-ItemProperty -Path "$urlPath\\command" -Name "(Default)" -Value '${getUrlCommand.replace(/'/g, "''")}'

    Write-Host "Context menu registered successfully"
  `;

  await runPowerShell(script);

  // Also register the Windows 11 sparse package manifest for modern context menu
  await registerWindows11ContextMenu(exePath, actualSyncIconPath);
}

async function registerWindows11ContextMenu(exePath, iconPath) {
  // Windows 11 uses a different approach for the modern context menu
  // We need to register via the newer shell extension mechanism

  const script = `
    # For Windows 11 modern context menu, we set additional registry values
    $regPath = "HKCU:\\Software\\Classes\\Directory\\shell\\${VERB_NAME}"

    # These help Windows 11 show it in the modern menu
    Set-ItemProperty -Path $regPath -Name "Extended" -Value "" -ErrorAction SilentlyContinue
    Remove-ItemProperty -Path $regPath -Name "Extended" -ErrorAction SilentlyContinue

    # Set the CommandStateSync flag for modern menu visibility
    Set-ItemProperty -Path $regPath -Name "CommandStateSync" -Value "" -ErrorAction SilentlyContinue

    # NeverDefault helps with positioning
    Set-ItemProperty -Path $regPath -Name "NeverDefault" -Value "" -ErrorAction SilentlyContinue

    Write-Host "Windows 11 context menu updated"
  `;

  try {
    await runPowerShell(script);
  } catch (error) {
    console.log('Windows 11 specific registration skipped:', error.message);
  }
}

async function unregisterContextMenu() {
  const script = `
    # Remove SYNC context menu items
    Remove-Item -Path "HKCU:\\Software\\Classes\\Directory\\shell\\${VERB_SYNC}" -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item -Path "HKCU:\\Software\\Classes\\Directory\\Background\\shell\\${VERB_SYNC}" -Recurse -Force -ErrorAction SilentlyContinue

    # Remove GET URL context menu items
    Remove-Item -Path "HKCU:\\Software\\Classes\\Directory\\shell\\${VERB_GET_URL}" -Recurse -Force -ErrorAction SilentlyContinue

    Write-Host "Context menu unregistered successfully"
  `;

  await runPowerShell(script);
}

async function isContextMenuRegistered() {
  const script = `
    $exists = Test-Path "HKCU:\\Software\\Classes\\Directory\\shell\\${VERB_SYNC}"
    Write-Host $exists
  `;

  try {
    const result = await runPowerShell(script);
    return result.trim().toLowerCase() === 'true';
  } catch {
    return false;
  }
}

module.exports = {
  registerContextMenu,
  unregisterContextMenu,
  isContextMenuRegistered
};
