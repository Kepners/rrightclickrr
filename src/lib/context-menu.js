const { exec } = require('child_process');
const path = require('path');

async function runPowerShell(script) {
  return new Promise((resolve, reject) => {
    exec(`powershell -ExecutionPolicy Bypass -Command "${script.replace(/"/g, '\\"')}"`, (error, stdout, stderr) => {
      if (error) reject(new Error(stderr || error.message));
      else resolve(stdout);
    });
  });
}

async function registerContextMenu() {
  const electronPath = process.execPath;
  const appPath = path.join(__dirname, '..', '..');
  const syncIconPath = path.join(appPath, 'assets', 'sync-icon.ico');
  const linkIconPath = path.join(appPath, 'assets', 'link-icon.ico');
  const copyIconPath = path.join(appPath, 'assets', 'copy-icon.ico');

  // Commands
  const syncCmd = `"${electronPath}" "${appPath}" --sync-folder "%V"`;
  const copyCmd = `"${electronPath}" "${appPath}" --copy-folder "%V"`;
  const getUrlCmd = `"${electronPath}" "${appPath}" --get-url "%V"`;
  const getUrlFileCmd = `"${electronPath}" "${appPath}" --get-url "%1"`;
  const openDriveCmd = `"${electronPath}" "${appPath}" --open-drive "%V"`;
  const openDriveFileCmd = `"${electronPath}" "${appPath}" --open-drive "%1"`;

  const script = `
    # Sync to Google Drive (folders only - upload + watch for changes)
    New-Item -Path 'HKCU:\\Software\\Classes\\Directory\\shell\\SyncToGoogleDrive' -Force | Out-Null
    Set-ItemProperty -Path 'HKCU:\\Software\\Classes\\Directory\\shell\\SyncToGoogleDrive' -Name '(Default)' -Value 'Sync to Google Drive'
    Set-ItemProperty -Path 'HKCU:\\Software\\Classes\\Directory\\shell\\SyncToGoogleDrive' -Name 'Icon' -Value '${syncIconPath.replace(/\\/g, '\\\\')}'
    New-Item -Path 'HKCU:\\Software\\Classes\\Directory\\shell\\SyncToGoogleDrive\\command' -Force | Out-Null
    Set-ItemProperty -Path 'HKCU:\\Software\\Classes\\Directory\\shell\\SyncToGoogleDrive\\command' -Name '(Default)' -Value '${syncCmd.replace(/'/g, "''")}'

    # Copy to Google Drive (folders only - one-time upload, no watching)
    New-Item -Path 'HKCU:\\Software\\Classes\\Directory\\shell\\CopyToGoogleDrive' -Force | Out-Null
    Set-ItemProperty -Path 'HKCU:\\Software\\Classes\\Directory\\shell\\CopyToGoogleDrive' -Name '(Default)' -Value 'Copy to Google Drive'
    Set-ItemProperty -Path 'HKCU:\\Software\\Classes\\Directory\\shell\\CopyToGoogleDrive' -Name 'Icon' -Value '${copyIconPath.replace(/\\/g, '\\\\')}'
    New-Item -Path 'HKCU:\\Software\\Classes\\Directory\\shell\\CopyToGoogleDrive\\command' -Force | Out-Null
    Set-ItemProperty -Path 'HKCU:\\Software\\Classes\\Directory\\shell\\CopyToGoogleDrive\\command' -Name '(Default)' -Value '${copyCmd.replace(/'/g, "''")}'

    # Open in Google Drive (folders)
    New-Item -Path 'HKCU:\\Software\\Classes\\Directory\\shell\\OpenInGoogleDrive' -Force | Out-Null
    Set-ItemProperty -Path 'HKCU:\\Software\\Classes\\Directory\\shell\\OpenInGoogleDrive' -Name '(Default)' -Value 'Open in Google Drive'
    Set-ItemProperty -Path 'HKCU:\\Software\\Classes\\Directory\\shell\\OpenInGoogleDrive' -Name 'Icon' -Value '${linkIconPath.replace(/\\/g, '\\\\')}'
    New-Item -Path 'HKCU:\\Software\\Classes\\Directory\\shell\\OpenInGoogleDrive\\command' -Force | Out-Null
    Set-ItemProperty -Path 'HKCU:\\Software\\Classes\\Directory\\shell\\OpenInGoogleDrive\\command' -Name '(Default)' -Value '${openDriveCmd.replace(/'/g, "''")}'

    # Open in Google Drive (files)
    New-Item -Path 'HKCU:\\Software\\Classes\\*\\shell\\OpenInGoogleDrive' -Force | Out-Null
    Set-ItemProperty -Path 'HKCU:\\Software\\Classes\\*\\shell\\OpenInGoogleDrive' -Name '(Default)' -Value 'Open in Google Drive'
    Set-ItemProperty -Path 'HKCU:\\Software\\Classes\\*\\shell\\OpenInGoogleDrive' -Name 'Icon' -Value '${linkIconPath.replace(/\\/g, '\\\\')}'
    New-Item -Path 'HKCU:\\Software\\Classes\\*\\shell\\OpenInGoogleDrive\\command' -Force | Out-Null
    Set-ItemProperty -Path 'HKCU:\\Software\\Classes\\*\\shell\\OpenInGoogleDrive\\command' -Name '(Default)' -Value '${openDriveFileCmd.replace(/'/g, "''")}'

    # Copy Google Drive Link (folders)
    New-Item -Path 'HKCU:\\Software\\Classes\\Directory\\shell\\GetDriveLink' -Force | Out-Null
    Set-ItemProperty -Path 'HKCU:\\Software\\Classes\\Directory\\shell\\GetDriveLink' -Name '(Default)' -Value 'Copy Google Drive Link'
    Set-ItemProperty -Path 'HKCU:\\Software\\Classes\\Directory\\shell\\GetDriveLink' -Name 'Icon' -Value '${linkIconPath.replace(/\\/g, '\\\\')}'
    New-Item -Path 'HKCU:\\Software\\Classes\\Directory\\shell\\GetDriveLink\\command' -Force | Out-Null
    Set-ItemProperty -Path 'HKCU:\\Software\\Classes\\Directory\\shell\\GetDriveLink\\command' -Name '(Default)' -Value '${getUrlCmd.replace(/'/g, "''")}'

    # Copy Google Drive Link (files)
    New-Item -Path 'HKCU:\\Software\\Classes\\*\\shell\\GetDriveLink' -Force | Out-Null
    Set-ItemProperty -Path 'HKCU:\\Software\\Classes\\*\\shell\\GetDriveLink' -Name '(Default)' -Value 'Copy Google Drive Link'
    Set-ItemProperty -Path 'HKCU:\\Software\\Classes\\*\\shell\\GetDriveLink' -Name 'Icon' -Value '${linkIconPath.replace(/\\/g, '\\\\')}'
    New-Item -Path 'HKCU:\\Software\\Classes\\*\\shell\\GetDriveLink\\command' -Force | Out-Null
    Set-ItemProperty -Path 'HKCU:\\Software\\Classes\\*\\shell\\GetDriveLink\\command' -Name '(Default)' -Value '${getUrlFileCmd.replace(/'/g, "''")}'
  `;

  await runPowerShell(script);
}

async function unregisterContextMenu() {
  const script = `
    Remove-Item -Path 'HKCU:\\Software\\Classes\\Directory\\shell\\SyncToGoogleDrive' -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item -Path 'HKCU:\\Software\\Classes\\Directory\\shell\\CopyToGoogleDrive' -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item -Path 'HKCU:\\Software\\Classes\\Directory\\shell\\GetDriveLink' -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item -Path 'HKCU:\\Software\\Classes\\*\\shell\\GetDriveLink' -Recurse -Force -ErrorAction SilentlyContinue
  `;
  await runPowerShell(script);
}

async function isContextMenuRegistered() {
  try {
    const result = await runPowerShell(`Test-Path 'HKCU:\\Software\\Classes\\Directory\\shell\\SyncToGoogleDrive'`);
    return result.trim().toLowerCase() === 'true';
  } catch {
    return false;
  }
}

module.exports = { registerContextMenu, unregisterContextMenu, isContextMenuRegistered };
