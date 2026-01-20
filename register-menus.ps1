# Register RRightclickrr context menus
# Uses launcher.js to spawn Electron detached (prevents EPIPE errors from Explorer)

$nodePath = "C:\Program Files\nodejs\node.exe"
$launcherPath = "c:\Users\kepne\OneDrive\Documents\GitHub\rrightclickrr\launcher.js"
$syncIcon = "c:\Users\kepne\OneDrive\Documents\GitHub\rrightclickrr\assets\sync-icon.ico"
$copyIcon = "c:\Users\kepne\OneDrive\Documents\GitHub\rrightclickrr\assets\copy-icon.ico"
$linkIcon = "c:\Users\kepne\OneDrive\Documents\GitHub\rrightclickrr\assets\link-icon.ico"

# Clean up old entries first
Remove-Item -Path 'HKCU:\Software\Classes\Directory\shell\SyncToGoogleDrive' -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -Path 'HKCU:\Software\Classes\Directory\shell\CopyToGoogleDrive' -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -Path 'HKCU:\Software\Classes\Directory\shell\OpenInGoogleDrive' -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -Path 'HKCU:\Software\Classes\Directory\shell\GetDriveLink' -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -Path 'HKCU:\Software\Classes\*\shell\GetDriveLink' -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -Path 'HKCU:\Software\Classes\*\shell\OpenInGoogleDrive' -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -Path 'HKCU:\Software\Classes\Directory\shell\RR_SyncDrive' -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -Path 'HKCU:\Software\Classes\Directory\shell\RR_CopyDrive' -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -Path 'HKCU:\Software\Classes\Directory\shell\RR_OpenDrive' -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -Path 'HKCU:\Software\Classes\Directory\shell\RR_CopyLink' -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -Path 'HKCU:\Software\Classes\*\shell\RR_OpenDrive' -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -Path 'HKCU:\Software\Classes\*\shell\RR_CopyLink' -Recurse -Force -ErrorAction SilentlyContinue
# Clean up Background (right-click inside folder) entries
Remove-Item -Path 'HKCU:\Software\Classes\Directory\Background\shell\SyncToGoogleDrive' -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -Path 'HKCU:\Software\Classes\Directory\Background\shell\RR_SyncDrive' -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -Path 'HKCU:\Software\Classes\Directory\Background\shell\RR_CopyDrive' -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -Path 'HKCU:\Software\Classes\Directory\Background\shell\RR_OpenDrive' -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -Path 'HKCU:\Software\Classes\Directory\Background\shell\RR_CopyLink' -Recurse -Force -ErrorAction SilentlyContinue

# 1. Sync to Google Drive (folder only - uploads + watches)
New-Item -Path 'HKCU:\Software\Classes\Directory\shell\RR_SyncDrive' -Force | Out-Null
Set-ItemProperty -Path 'HKCU:\Software\Classes\Directory\shell\RR_SyncDrive' -Name '(Default)' -Value 'Sync to Google Drive'
Set-ItemProperty -Path 'HKCU:\Software\Classes\Directory\shell\RR_SyncDrive' -Name 'Icon' -Value $syncIcon
New-Item -Path 'HKCU:\Software\Classes\Directory\shell\RR_SyncDrive\command' -Force | Out-Null
Set-ItemProperty -Path 'HKCU:\Software\Classes\Directory\shell\RR_SyncDrive\command' -Name '(Default)' -Value "`"$nodePath`" `"$launcherPath`" --sync-folder `"%V`""

# 2. Copy to Google Drive (folder only - one-time upload)
New-Item -Path 'HKCU:\Software\Classes\Directory\shell\RR_CopyDrive' -Force | Out-Null
Set-ItemProperty -Path 'HKCU:\Software\Classes\Directory\shell\RR_CopyDrive' -Name '(Default)' -Value 'Copy to Google Drive'
Set-ItemProperty -Path 'HKCU:\Software\Classes\Directory\shell\RR_CopyDrive' -Name 'Icon' -Value $copyIcon
New-Item -Path 'HKCU:\Software\Classes\Directory\shell\RR_CopyDrive\command' -Force | Out-Null
Set-ItemProperty -Path 'HKCU:\Software\Classes\Directory\shell\RR_CopyDrive\command' -Name '(Default)' -Value "`"$nodePath`" `"$launcherPath`" --copy-folder `"%V`""

# 3. Open in Google Drive (folder)
New-Item -Path 'HKCU:\Software\Classes\Directory\shell\RR_OpenDrive' -Force | Out-Null
Set-ItemProperty -Path 'HKCU:\Software\Classes\Directory\shell\RR_OpenDrive' -Name '(Default)' -Value 'Open in Google Drive'
Set-ItemProperty -Path 'HKCU:\Software\Classes\Directory\shell\RR_OpenDrive' -Name 'Icon' -Value $linkIcon
New-Item -Path 'HKCU:\Software\Classes\Directory\shell\RR_OpenDrive\command' -Force | Out-Null
Set-ItemProperty -Path 'HKCU:\Software\Classes\Directory\shell\RR_OpenDrive\command' -Name '(Default)' -Value "`"$nodePath`" `"$launcherPath`" --open-drive `"%V`""

# 4. Copy Drive Link (folder)
New-Item -Path 'HKCU:\Software\Classes\Directory\shell\RR_CopyLink' -Force | Out-Null
Set-ItemProperty -Path 'HKCU:\Software\Classes\Directory\shell\RR_CopyLink' -Name '(Default)' -Value 'Copy Drive Link'
Set-ItemProperty -Path 'HKCU:\Software\Classes\Directory\shell\RR_CopyLink' -Name 'Icon' -Value $linkIcon
New-Item -Path 'HKCU:\Software\Classes\Directory\shell\RR_CopyLink\command' -Force | Out-Null
Set-ItemProperty -Path 'HKCU:\Software\Classes\Directory\shell\RR_CopyLink\command' -Name '(Default)' -Value "`"$nodePath`" `"$launcherPath`" --get-url `"%V`""

# 5. Open in Google Drive (file)
New-Item -Path 'HKCU:\Software\Classes\*\shell\RR_OpenDrive' -Force | Out-Null
Set-ItemProperty -Path 'HKCU:\Software\Classes\*\shell\RR_OpenDrive' -Name '(Default)' -Value 'Open in Google Drive'
Set-ItemProperty -Path 'HKCU:\Software\Classes\*\shell\RR_OpenDrive' -Name 'Icon' -Value $linkIcon
New-Item -Path 'HKCU:\Software\Classes\*\shell\RR_OpenDrive\command' -Force | Out-Null
Set-ItemProperty -Path 'HKCU:\Software\Classes\*\shell\RR_OpenDrive\command' -Name '(Default)' -Value "`"$nodePath`" `"$launcherPath`" --open-drive `"%1`""

# 6. Copy Drive Link (file)
New-Item -Path 'HKCU:\Software\Classes\*\shell\RR_CopyLink' -Force | Out-Null
Set-ItemProperty -Path 'HKCU:\Software\Classes\*\shell\RR_CopyLink' -Name '(Default)' -Value 'Copy Drive Link'
Set-ItemProperty -Path 'HKCU:\Software\Classes\*\shell\RR_CopyLink' -Name 'Icon' -Value $linkIcon
New-Item -Path 'HKCU:\Software\Classes\*\shell\RR_CopyLink\command' -Force | Out-Null
Set-ItemProperty -Path 'HKCU:\Software\Classes\*\shell\RR_CopyLink\command' -Name '(Default)' -Value "`"$nodePath`" `"$launcherPath`" --get-url `"%1`""

# === BACKGROUND ENTRIES (right-click inside folder on empty space) ===
# These use %V for the current folder path

# 7. Sync to Google Drive (background)
New-Item -Path 'HKCU:\Software\Classes\Directory\Background\shell\RR_SyncDrive' -Force | Out-Null
Set-ItemProperty -Path 'HKCU:\Software\Classes\Directory\Background\shell\RR_SyncDrive' -Name '(Default)' -Value 'Sync this folder to Google Drive'
Set-ItemProperty -Path 'HKCU:\Software\Classes\Directory\Background\shell\RR_SyncDrive' -Name 'Icon' -Value $syncIcon
New-Item -Path 'HKCU:\Software\Classes\Directory\Background\shell\RR_SyncDrive\command' -Force | Out-Null
Set-ItemProperty -Path 'HKCU:\Software\Classes\Directory\Background\shell\RR_SyncDrive\command' -Name '(Default)' -Value "`"$nodePath`" `"$launcherPath`" --sync-folder `"%V`""

# 8. Copy to Google Drive (background)
New-Item -Path 'HKCU:\Software\Classes\Directory\Background\shell\RR_CopyDrive' -Force | Out-Null
Set-ItemProperty -Path 'HKCU:\Software\Classes\Directory\Background\shell\RR_CopyDrive' -Name '(Default)' -Value 'Copy this folder to Google Drive'
Set-ItemProperty -Path 'HKCU:\Software\Classes\Directory\Background\shell\RR_CopyDrive' -Name 'Icon' -Value $copyIcon
New-Item -Path 'HKCU:\Software\Classes\Directory\Background\shell\RR_CopyDrive\command' -Force | Out-Null
Set-ItemProperty -Path 'HKCU:\Software\Classes\Directory\Background\shell\RR_CopyDrive\command' -Name '(Default)' -Value "`"$nodePath`" `"$launcherPath`" --copy-folder `"%V`""

# 9. Open in Google Drive (background)
New-Item -Path 'HKCU:\Software\Classes\Directory\Background\shell\RR_OpenDrive' -Force | Out-Null
Set-ItemProperty -Path 'HKCU:\Software\Classes\Directory\Background\shell\RR_OpenDrive' -Name '(Default)' -Value 'Open this folder in Google Drive'
Set-ItemProperty -Path 'HKCU:\Software\Classes\Directory\Background\shell\RR_OpenDrive' -Name 'Icon' -Value $linkIcon
New-Item -Path 'HKCU:\Software\Classes\Directory\Background\shell\RR_OpenDrive\command' -Force | Out-Null
Set-ItemProperty -Path 'HKCU:\Software\Classes\Directory\Background\shell\RR_OpenDrive\command' -Name '(Default)' -Value "`"$nodePath`" `"$launcherPath`" --open-drive `"%V`""

# 10. Copy Drive Link (background)
New-Item -Path 'HKCU:\Software\Classes\Directory\Background\shell\RR_CopyLink' -Force | Out-Null
Set-ItemProperty -Path 'HKCU:\Software\Classes\Directory\Background\shell\RR_CopyLink' -Name '(Default)' -Value 'Copy Drive Link'
Set-ItemProperty -Path 'HKCU:\Software\Classes\Directory\Background\shell\RR_CopyLink' -Name 'Icon' -Value $linkIcon
New-Item -Path 'HKCU:\Software\Classes\Directory\Background\shell\RR_CopyLink\command' -Force | Out-Null
Set-ItemProperty -Path 'HKCU:\Software\Classes\Directory\Background\shell\RR_CopyLink\command' -Name '(Default)' -Value "`"$nodePath`" `"$launcherPath`" --get-url `"%V`""

Write-Host "Context menus registered successfully! (Using detached launcher)"
Write-Host ""
Write-Host "RIGHT-CLICK ON FOLDERS:"
Write-Host "  - Sync to Google Drive (upload + watch)"
Write-Host "  - Copy to Google Drive (one-time upload)"
Write-Host "  - Open in Google Drive"
Write-Host "  - Copy Drive Link"
Write-Host ""
Write-Host "RIGHT-CLICK INSIDE FOLDERS (background):"
Write-Host "  - Sync this folder to Google Drive"
Write-Host "  - Copy this folder to Google Drive"
Write-Host "  - Open this folder in Google Drive"
Write-Host "  - Copy Drive Link"
Write-Host ""
Write-Host "RIGHT-CLICK ON FILES:"
Write-Host "  - Open in Google Drive"
Write-Host "  - Copy Drive Link"
