@echo off
REM Uses launcher.js to spawn Electron detached (prevents EPIPE errors from Explorer)

set "nodePath=C:\Program Files\nodejs\node.exe"
set "launcherPath=c:\Users\kepne\OneDrive\Documents\GitHub\rrightclickrr\launcher.js"
set "syncIcon=c:\Users\kepne\OneDrive\Documents\GitHub\rrightclickrr\assets\sync-icon.ico"
set "copyIcon=c:\Users\kepne\OneDrive\Documents\GitHub\rrightclickrr\assets\copy-icon.ico"
set "linkIcon=c:\Users\kepne\OneDrive\Documents\GitHub\rrightclickrr\assets\link-icon.ico"

echo Registering background context menus (using detached launcher)...

:: Remove old entries
reg delete "HKCU\Software\Classes\Directory\Background\shell\SyncToGoogleDrive" /f 2>nul
reg delete "HKCU\Software\Classes\Directory\Background\shell\RR_SyncDrive" /f 2>nul
reg delete "HKCU\Software\Classes\Directory\Background\shell\RR_CopyDrive" /f 2>nul
reg delete "HKCU\Software\Classes\Directory\Background\shell\RR_OpenDrive" /f 2>nul
reg delete "HKCU\Software\Classes\Directory\Background\shell\RR_CopyLink" /f 2>nul

:: Sync to Google Drive (background)
reg add "HKCU\Software\Classes\Directory\Background\shell\RR_SyncDrive" /ve /d "Sync this folder to Google Drive" /f
reg add "HKCU\Software\Classes\Directory\Background\shell\RR_SyncDrive" /v "Icon" /d "%syncIcon%" /f
reg add "HKCU\Software\Classes\Directory\Background\shell\RR_SyncDrive\command" /ve /d "\"%nodePath%\" \"%launcherPath%\" --sync-folder \"%%V\"" /f

:: Copy to Google Drive (background)
reg add "HKCU\Software\Classes\Directory\Background\shell\RR_CopyDrive" /ve /d "Copy this folder to Google Drive" /f
reg add "HKCU\Software\Classes\Directory\Background\shell\RR_CopyDrive" /v "Icon" /d "%copyIcon%" /f
reg add "HKCU\Software\Classes\Directory\Background\shell\RR_CopyDrive\command" /ve /d "\"%nodePath%\" \"%launcherPath%\" --copy-folder \"%%V\"" /f

:: Open in Google Drive (background)
reg add "HKCU\Software\Classes\Directory\Background\shell\RR_OpenDrive" /ve /d "Open this folder in Google Drive" /f
reg add "HKCU\Software\Classes\Directory\Background\shell\RR_OpenDrive" /v "Icon" /d "%linkIcon%" /f
reg add "HKCU\Software\Classes\Directory\Background\shell\RR_OpenDrive\command" /ve /d "\"%nodePath%\" \"%launcherPath%\" --open-drive \"%%V\"" /f

:: Copy Drive Link (background)
reg add "HKCU\Software\Classes\Directory\Background\shell\RR_CopyLink" /ve /d "Copy Drive Link" /f
reg add "HKCU\Software\Classes\Directory\Background\shell\RR_CopyLink" /v "Icon" /d "%linkIcon%" /f
reg add "HKCU\Software\Classes\Directory\Background\shell\RR_CopyLink\command" /ve /d "\"%nodePath%\" \"%launcherPath%\" --get-url \"%%V\"" /f

echo Done!
echo.
echo Right-click INSIDE any folder to see:
echo   - Sync this folder to Google Drive
echo   - Copy this folder to Google Drive
echo   - Open this folder in Google Drive
echo   - Copy Drive Link
