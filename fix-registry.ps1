$launcherPath = "C:\Users\kepne\OneDrive\Documents\GitHub\rrightclickrr\sync-launcher.vbs"
$iconPath = "C:\Users\kepne\OneDrive\Documents\GitHub\rrightclickrr\assets\sync-icon.ico"

# Use wscript to run the VBS launcher silently
$syncCmd = "wscript.exe `"$launcherPath`" `"%V`""

Write-Host "Setting command to:"
Write-Host $syncCmd

# Create/update the registry entries
New-Item -Path "HKCU:\Software\Classes\Directory\shell\SyncToGoogleDrive" -Force | Out-Null
Set-ItemProperty -Path "HKCU:\Software\Classes\Directory\shell\SyncToGoogleDrive" -Name "(Default)" -Value "Sync to Google Drive"
Set-ItemProperty -Path "HKCU:\Software\Classes\Directory\shell\SyncToGoogleDrive" -Name "Icon" -Value $iconPath

New-Item -Path "HKCU:\Software\Classes\Directory\shell\SyncToGoogleDrive\command" -Force | Out-Null
Set-ItemProperty -Path "HKCU:\Software\Classes\Directory\shell\SyncToGoogleDrive\command" -Name "(Default)" -Value $syncCmd

Write-Host "Done! Verifying..."
Get-ItemProperty "HKCU:\Software\Classes\Directory\shell\SyncToGoogleDrive\command" | Select-Object -ExpandProperty "(default)"
