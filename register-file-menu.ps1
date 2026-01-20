New-Item -Path 'HKCU:\Software\Classes\*\shell\GetDriveLink' -Force | Out-Null
Set-ItemProperty -Path 'HKCU:\Software\Classes\*\shell\GetDriveLink' -Name '(Default)' -Value 'Copy Google Drive Link'
Set-ItemProperty -Path 'HKCU:\Software\Classes\*\shell\GetDriveLink' -Name 'Icon' -Value 'C:\Users\kepne\OneDrive\Documents\GitHub\rrightclickrr\assets\link-icon.ico'
New-Item -Path 'HKCU:\Software\Classes\*\shell\GetDriveLink\command' -Force | Out-Null
Set-ItemProperty -Path 'HKCU:\Software\Classes\*\shell\GetDriveLink\command' -Name '(Default)' -Value '"C:\Users\kepne\OneDrive\Documents\GitHub\rrightclickrr\node_modules\electron\dist\electron.exe" "C:\Users\kepne\OneDrive\Documents\GitHub\rrightclickrr" --get-url "%1"'
Write-Host "Done"
