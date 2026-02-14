const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { app } = require('electron');

const OVERLAY_CLSID = '{7B3B5E52-A1F0-4C5E-9B8A-1C2D3E4F5A6F}';

async function runPowerShell(script) {
  const scriptPath = path.join(
    os.tmpdir(),
    `rrightclickrr-${Date.now()}-${Math.random().toString(16).slice(2)}.ps1`
  );

  await fs.promises.writeFile(scriptPath, script, 'utf8');

  return new Promise((resolve, reject) => {
    const child = spawn(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath],
      { windowsHide: true }
    );

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    const cleanup = () => {
      fs.unlink(scriptPath, () => {});
    };

    child.on('error', (error) => {
      cleanup();
      reject(error);
    });

    child.on('close', (code) => {
      cleanup();
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(stderr.trim() || `PowerShell exited with code ${code}`));
      }
    });
  });
}

function getRuntimeContext() {
  const isPackaged = app.isPackaged;
  const executable = process.execPath;
  const appRoot = isPackaged ? path.dirname(executable) : path.join(__dirname, '..', '..');
  const assetsPath = isPackaged ? path.join(process.resourcesPath, 'assets') : path.join(appRoot, 'assets');
  return { isPackaged, executable, appRoot, assetsPath };
}

function buildCommand(flag, shellArg) {
  const { isPackaged, executable, appRoot } = getRuntimeContext();
  if (isPackaged) {
    return `"${executable}" ${flag} "${shellArg}"`;
  }
  // Dev mode launches Electron with the app directory as first argument.
  return `"${executable}" "${appRoot}" ${flag} "${shellArg}"`;
}

function getShellExtensionPath() {
  const { isPackaged, appRoot } = getRuntimeContext();
  if (isPackaged) {
    return path.join(appRoot, 'shell-extension', 'RRightclickrrShell.dll');
  }

  const devDistDll = path.join(appRoot, 'shell-extension', 'dist', 'RRightclickrrShell.dll');
  if (fs.existsSync(devDistDll)) {
    return devDistDll;
  }

  return path.join(appRoot, 'shell-extension', 'RRightclickrrShell.dll');
}

async function registerContextMenu() {
  const { assetsPath } = getRuntimeContext();
  const shellExtensionPath = getShellExtensionPath();
  const syncIconPath = path.join(assetsPath, 'sync-icon.ico');
  const copyIconPath = path.join(assetsPath, 'copy-icon.ico');
  const linkIconPath = path.join(assetsPath, 'link-icon.ico');

  const syncCmd = buildCommand('--sync-folder', '%V');
  const copyCmd = buildCommand('--copy-folder', '%V');
  const openDriveCmd = buildCommand('--open-drive', '%V');
  const getUrlCmd = buildCommand('--get-url', '%V');
  const openDriveFileCmd = buildCommand('--open-drive', '%1');
  const getUrlFileCmd = buildCommand('--get-url', '%1');
  const escapedShellExtensionPath = shellExtensionPath.replace(/\\/g, '\\\\').replace(/'/g, "''");

  const script = `
    # Refresh overlay handler registration
    Remove-Item -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\ShellIconOverlayIdentifiers\\ RRightclickrrSynced' -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item -Path 'HKCU:\\Software\\Classes\\CLSID\\${OVERLAY_CLSID}' -Recurse -Force -ErrorAction SilentlyContinue

    if (Test-Path '${escapedShellExtensionPath}') {
      New-Item -Path 'HKCU:\\Software\\Classes\\CLSID\\${OVERLAY_CLSID}' -Force | Out-Null
      Set-ItemProperty -Path 'HKCU:\\Software\\Classes\\CLSID\\${OVERLAY_CLSID}' -Name '(Default)' -Value 'RRightclickrr Sync Overlay'
      New-Item -Path 'HKCU:\\Software\\Classes\\CLSID\\${OVERLAY_CLSID}\\InprocServer32' -Force | Out-Null
      Set-ItemProperty -Path 'HKCU:\\Software\\Classes\\CLSID\\${OVERLAY_CLSID}\\InprocServer32' -Name '(Default)' -Value '${escapedShellExtensionPath}'
      Set-ItemProperty -Path 'HKCU:\\Software\\Classes\\CLSID\\${OVERLAY_CLSID}\\InprocServer32' -Name 'ThreadingModel' -Value 'Apartment'
      New-Item -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\ShellIconOverlayIdentifiers\\ RRightclickrrSynced' -Force | Out-Null
      Set-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\ShellIconOverlayIdentifiers\\ RRightclickrrSynced' -Name '(Default)' -Value '${OVERLAY_CLSID}'
    }

    # Remove old/legacy keys first
    Remove-Item -Path 'HKCU:\\Software\\Classes\\Directory\\shell\\SyncToGoogleDrive' -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item -Path 'HKCU:\\Software\\Classes\\Directory\\shell\\CopyToGoogleDrive' -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item -Path 'HKCU:\\Software\\Classes\\Directory\\shell\\OpenInGoogleDrive' -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item -Path 'HKCU:\\Software\\Classes\\Directory\\shell\\GetDriveLink' -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item -Path 'HKCU:\\Software\\Classes\\*\\shell\\OpenInGoogleDrive' -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item -Path 'HKCU:\\Software\\Classes\\*\\shell\\GetDriveLink' -Recurse -Force -ErrorAction SilentlyContinue

    # Directory entries
    New-Item -Path 'HKCU:\\Software\\Classes\\Directory\\shell\\RR_SyncDrive' -Force | Out-Null
    Set-ItemProperty -Path 'HKCU:\\Software\\Classes\\Directory\\shell\\RR_SyncDrive' -Name '(Default)' -Value 'Sync to Google Drive'
    Set-ItemProperty -Path 'HKCU:\\Software\\Classes\\Directory\\shell\\RR_SyncDrive' -Name 'Icon' -Value '${syncIconPath.replace(/\\/g, '\\\\')}'
    New-Item -Path 'HKCU:\\Software\\Classes\\Directory\\shell\\RR_SyncDrive\\command' -Force | Out-Null
    Set-ItemProperty -Path 'HKCU:\\Software\\Classes\\Directory\\shell\\RR_SyncDrive\\command' -Name '(Default)' -Value '${syncCmd.replace(/'/g, "''")}'

    New-Item -Path 'HKCU:\\Software\\Classes\\Directory\\shell\\RR_CopyDrive' -Force | Out-Null
    Set-ItemProperty -Path 'HKCU:\\Software\\Classes\\Directory\\shell\\RR_CopyDrive' -Name '(Default)' -Value 'Copy to Google Drive'
    Set-ItemProperty -Path 'HKCU:\\Software\\Classes\\Directory\\shell\\RR_CopyDrive' -Name 'Icon' -Value '${copyIconPath.replace(/\\/g, '\\\\')}'
    New-Item -Path 'HKCU:\\Software\\Classes\\Directory\\shell\\RR_CopyDrive\\command' -Force | Out-Null
    Set-ItemProperty -Path 'HKCU:\\Software\\Classes\\Directory\\shell\\RR_CopyDrive\\command' -Name '(Default)' -Value '${copyCmd.replace(/'/g, "''")}'

    New-Item -Path 'HKCU:\\Software\\Classes\\Directory\\shell\\RR_OpenDrive' -Force | Out-Null
    Set-ItemProperty -Path 'HKCU:\\Software\\Classes\\Directory\\shell\\RR_OpenDrive' -Name '(Default)' -Value 'Open in Google Drive'
    Set-ItemProperty -Path 'HKCU:\\Software\\Classes\\Directory\\shell\\RR_OpenDrive' -Name 'Icon' -Value '${linkIconPath.replace(/\\/g, '\\\\')}'
    New-Item -Path 'HKCU:\\Software\\Classes\\Directory\\shell\\RR_OpenDrive\\command' -Force | Out-Null
    Set-ItemProperty -Path 'HKCU:\\Software\\Classes\\Directory\\shell\\RR_OpenDrive\\command' -Name '(Default)' -Value '${openDriveCmd.replace(/'/g, "''")}'

    New-Item -Path 'HKCU:\\Software\\Classes\\Directory\\shell\\RR_CopyLink' -Force | Out-Null
    Set-ItemProperty -Path 'HKCU:\\Software\\Classes\\Directory\\shell\\RR_CopyLink' -Name '(Default)' -Value 'Copy Drive Link'
    Set-ItemProperty -Path 'HKCU:\\Software\\Classes\\Directory\\shell\\RR_CopyLink' -Name 'Icon' -Value '${linkIconPath.replace(/\\/g, '\\\\')}'
    New-Item -Path 'HKCU:\\Software\\Classes\\Directory\\shell\\RR_CopyLink\\command' -Force | Out-Null
    Set-ItemProperty -Path 'HKCU:\\Software\\Classes\\Directory\\shell\\RR_CopyLink\\command' -Name '(Default)' -Value '${getUrlCmd.replace(/'/g, "''")}'

    # Background (inside folder empty space)
    New-Item -Path 'HKCU:\\Software\\Classes\\Directory\\Background\\shell\\RR_SyncDrive' -Force | Out-Null
    Set-ItemProperty -Path 'HKCU:\\Software\\Classes\\Directory\\Background\\shell\\RR_SyncDrive' -Name '(Default)' -Value 'Sync this folder to Google Drive'
    Set-ItemProperty -Path 'HKCU:\\Software\\Classes\\Directory\\Background\\shell\\RR_SyncDrive' -Name 'Icon' -Value '${syncIconPath.replace(/\\/g, '\\\\')}'
    New-Item -Path 'HKCU:\\Software\\Classes\\Directory\\Background\\shell\\RR_SyncDrive\\command' -Force | Out-Null
    Set-ItemProperty -Path 'HKCU:\\Software\\Classes\\Directory\\Background\\shell\\RR_SyncDrive\\command' -Name '(Default)' -Value '${syncCmd.replace(/'/g, "''")}'

    New-Item -Path 'HKCU:\\Software\\Classes\\Directory\\Background\\shell\\RR_CopyDrive' -Force | Out-Null
    Set-ItemProperty -Path 'HKCU:\\Software\\Classes\\Directory\\Background\\shell\\RR_CopyDrive' -Name '(Default)' -Value 'Copy this folder to Google Drive'
    Set-ItemProperty -Path 'HKCU:\\Software\\Classes\\Directory\\Background\\shell\\RR_CopyDrive' -Name 'Icon' -Value '${copyIconPath.replace(/\\/g, '\\\\')}'
    New-Item -Path 'HKCU:\\Software\\Classes\\Directory\\Background\\shell\\RR_CopyDrive\\command' -Force | Out-Null
    Set-ItemProperty -Path 'HKCU:\\Software\\Classes\\Directory\\Background\\shell\\RR_CopyDrive\\command' -Name '(Default)' -Value '${copyCmd.replace(/'/g, "''")}'

    New-Item -Path 'HKCU:\\Software\\Classes\\Directory\\Background\\shell\\RR_OpenDrive' -Force | Out-Null
    Set-ItemProperty -Path 'HKCU:\\Software\\Classes\\Directory\\Background\\shell\\RR_OpenDrive' -Name '(Default)' -Value 'Open this folder in Google Drive'
    Set-ItemProperty -Path 'HKCU:\\Software\\Classes\\Directory\\Background\\shell\\RR_OpenDrive' -Name 'Icon' -Value '${linkIconPath.replace(/\\/g, '\\\\')}'
    New-Item -Path 'HKCU:\\Software\\Classes\\Directory\\Background\\shell\\RR_OpenDrive\\command' -Force | Out-Null
    Set-ItemProperty -Path 'HKCU:\\Software\\Classes\\Directory\\Background\\shell\\RR_OpenDrive\\command' -Name '(Default)' -Value '${openDriveCmd.replace(/'/g, "''")}'

    New-Item -Path 'HKCU:\\Software\\Classes\\Directory\\Background\\shell\\RR_CopyLink' -Force | Out-Null
    Set-ItemProperty -Path 'HKCU:\\Software\\Classes\\Directory\\Background\\shell\\RR_CopyLink' -Name '(Default)' -Value 'Copy Drive Link'
    Set-ItemProperty -Path 'HKCU:\\Software\\Classes\\Directory\\Background\\shell\\RR_CopyLink' -Name 'Icon' -Value '${linkIconPath.replace(/\\/g, '\\\\')}'
    New-Item -Path 'HKCU:\\Software\\Classes\\Directory\\Background\\shell\\RR_CopyLink\\command' -Force | Out-Null
    Set-ItemProperty -Path 'HKCU:\\Software\\Classes\\Directory\\Background\\shell\\RR_CopyLink\\command' -Name '(Default)' -Value '${getUrlCmd.replace(/'/g, "''")}'

    # File entries
    New-Item -Path 'HKCU:\\Software\\Classes\\*\\shell\\RR_OpenDrive' -Force | Out-Null
    Set-ItemProperty -Path 'HKCU:\\Software\\Classes\\*\\shell\\RR_OpenDrive' -Name '(Default)' -Value 'Open in Google Drive'
    Set-ItemProperty -Path 'HKCU:\\Software\\Classes\\*\\shell\\RR_OpenDrive' -Name 'Icon' -Value '${linkIconPath.replace(/\\/g, '\\\\')}'
    New-Item -Path 'HKCU:\\Software\\Classes\\*\\shell\\RR_OpenDrive\\command' -Force | Out-Null
    Set-ItemProperty -Path 'HKCU:\\Software\\Classes\\*\\shell\\RR_OpenDrive\\command' -Name '(Default)' -Value '${openDriveFileCmd.replace(/'/g, "''")}'

    New-Item -Path 'HKCU:\\Software\\Classes\\*\\shell\\RR_CopyLink' -Force | Out-Null
    Set-ItemProperty -Path 'HKCU:\\Software\\Classes\\*\\shell\\RR_CopyLink' -Name '(Default)' -Value 'Copy Drive Link'
    Set-ItemProperty -Path 'HKCU:\\Software\\Classes\\*\\shell\\RR_CopyLink' -Name 'Icon' -Value '${linkIconPath.replace(/\\/g, '\\\\')}'
    New-Item -Path 'HKCU:\\Software\\Classes\\*\\shell\\RR_CopyLink\\command' -Force | Out-Null
    Set-ItemProperty -Path 'HKCU:\\Software\\Classes\\*\\shell\\RR_CopyLink\\command' -Name '(Default)' -Value '${getUrlFileCmd.replace(/'/g, "''")}'
  `;

  await runPowerShell(script);
}

async function unregisterContextMenu() {
  const script = `
    # Remove overlay icon handler keys
    Remove-Item -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\ShellIconOverlayIdentifiers\\ RRightclickrrSynced' -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item -Path 'HKCU:\\Software\\Classes\\CLSID\\${OVERLAY_CLSID}' -Recurse -Force -ErrorAction SilentlyContinue

    # Remove current keys
    Remove-Item -Path 'HKCU:\\Software\\Classes\\Directory\\shell\\RR_SyncDrive' -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item -Path 'HKCU:\\Software\\Classes\\Directory\\shell\\RR_CopyDrive' -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item -Path 'HKCU:\\Software\\Classes\\Directory\\shell\\RR_OpenDrive' -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item -Path 'HKCU:\\Software\\Classes\\Directory\\shell\\RR_CopyLink' -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item -Path 'HKCU:\\Software\\Classes\\Directory\\Background\\shell\\RR_SyncDrive' -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item -Path 'HKCU:\\Software\\Classes\\Directory\\Background\\shell\\RR_CopyDrive' -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item -Path 'HKCU:\\Software\\Classes\\Directory\\Background\\shell\\RR_OpenDrive' -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item -Path 'HKCU:\\Software\\Classes\\Directory\\Background\\shell\\RR_CopyLink' -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item -Path 'HKCU:\\Software\\Classes\\*\\shell\\RR_OpenDrive' -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item -Path 'HKCU:\\Software\\Classes\\*\\shell\\RR_CopyLink' -Recurse -Force -ErrorAction SilentlyContinue

    # Remove legacy keys from older builds
    Remove-Item -Path 'HKCU:\\Software\\Classes\\Directory\\shell\\SyncToGoogleDrive' -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item -Path 'HKCU:\\Software\\Classes\\Directory\\shell\\CopyToGoogleDrive' -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item -Path 'HKCU:\\Software\\Classes\\Directory\\shell\\OpenInGoogleDrive' -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item -Path 'HKCU:\\Software\\Classes\\Directory\\shell\\GetDriveLink' -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item -Path 'HKCU:\\Software\\Classes\\*\\shell\\OpenInGoogleDrive' -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item -Path 'HKCU:\\Software\\Classes\\*\\shell\\GetDriveLink' -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item -Path 'HKCU:\\Software\\Classes\\Directory\\Background\\shell\\SyncToGoogleDrive' -Recurse -Force -ErrorAction SilentlyContinue
  `;
  await runPowerShell(script);
}

async function isContextMenuRegistered() {
  try {
    const result = await runPowerShell(`
      if ((Test-Path 'HKCU:\\Software\\Classes\\Directory\\shell\\RR_SyncDrive') -or
          (Test-Path 'HKCU:\\Software\\Classes\\Directory\\shell\\SyncToGoogleDrive')) {
        Write-Output 'true'
      } else {
        Write-Output 'false'
      }
    `);
    return result.trim().toLowerCase() === 'true';
  } catch {
    return false;
  }
}

module.exports = { registerContextMenu, unregisterContextMenu, isContextMenuRegistered };
