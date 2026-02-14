; Custom NSIS installer script for RRightclickrr
; Registers context menu entries on install, removes them on uninstall
; Uses reg.exe for reliability (PowerShell can hang)
; Also registers sparse package for Windows 11 modern context menu

!macro customInstall
  DetailPrint "Registering Windows context menu..."

  ; === WINDOWS 11 MODERN MENU (Sparse Package) ===
  DetailPrint "Registering Windows 11 modern context menu..."

  ; Check if shell extension DLL exists
  IfFileExists "$INSTDIR\shell-extension\RRightclickrrShell.dll" 0 SkipSparsePackage

  ; Create external location mapping file for sparse package
  FileOpen $0 "$INSTDIR\shell-extension\mapping.txt" w
  FileWrite $0 "[ExternalContentLocation]$\r$\n"
  FileWrite $0 "$INSTDIR$\r$\n"
  FileClose $0

  ; Register the sparse package (Windows 11+)
  ; This gives the app "identity" and enables modern context menu
  nsExec::ExecToLog 'powershell -ExecutionPolicy Bypass -Command "Add-AppxPackage -Register $\'$INSTDIR\shell-extension\AppxManifest.xml$\' -ExternalLocation $\'$INSTDIR$\' -ErrorAction SilentlyContinue"'

  SkipSparsePackage:

  ; === SYNC OVERLAY ICON HANDLER ===
  ; {7B3B5E52-A1F0-4C5E-9B8A-1C2D3E4F5A6F}
  DetailPrint "Registering sync overlay icon handler..."
  nsExec::ExecToLog 'reg add "HKCU\Software\Classes\CLSID\{7B3B5E52-A1F0-4C5E-9B8A-1C2D3E4F5A6F}" /ve /d "RRightclickrr Sync Overlay" /f'
  nsExec::ExecToLog 'reg add "HKCU\Software\Classes\CLSID\{7B3B5E52-A1F0-4C5E-9B8A-1C2D3E4F5A6F}\InprocServer32" /ve /d "$INSTDIR\shell-extension\RRightclickrrShell.dll" /f'
  nsExec::ExecToLog 'reg add "HKCU\Software\Classes\CLSID\{7B3B5E52-A1F0-4C5E-9B8A-1C2D3E4F5A6F}\InprocServer32" /v "ThreadingModel" /d "Apartment" /f'
  nsExec::ExecToLog 'reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\ShellIconOverlayIdentifiers\ RRightclickrrSynced" /ve /d "{7B3B5E52-A1F0-4C5E-9B8A-1C2D3E4F5A6F}" /f'

  ; === CLASSIC MENU (Registry - works on all Windows) ===
  DetailPrint "Registering classic context menu (Show more options)..."

  ; FOLDER: Sync to Google Drive
  nsExec::ExecToLog 'reg add "HKCU\Software\Classes\Directory\shell\RR_SyncDrive" /ve /d "Sync to Google Drive" /f'
  nsExec::ExecToLog 'reg add "HKCU\Software\Classes\Directory\shell\RR_SyncDrive" /v "Icon" /d "$INSTDIR\resources\assets\sync-icon.ico" /f'
  nsExec::ExecToLog 'reg add "HKCU\Software\Classes\Directory\shell\RR_SyncDrive\command" /ve /d "\"$INSTDIR\RRightclickrr.exe\" --sync-folder \"%V\"" /f'

  ; FOLDER: Copy to Google Drive
  nsExec::ExecToLog 'reg add "HKCU\Software\Classes\Directory\shell\RR_CopyDrive" /ve /d "Copy to Google Drive" /f'
  nsExec::ExecToLog 'reg add "HKCU\Software\Classes\Directory\shell\RR_CopyDrive" /v "Icon" /d "$INSTDIR\resources\assets\copy-icon.ico" /f'
  nsExec::ExecToLog 'reg add "HKCU\Software\Classes\Directory\shell\RR_CopyDrive\command" /ve /d "\"$INSTDIR\RRightclickrr.exe\" --copy-folder \"%V\"" /f'

  ; FOLDER: Open in Google Drive
  nsExec::ExecToLog 'reg add "HKCU\Software\Classes\Directory\shell\RR_OpenDrive" /ve /d "Open in Google Drive" /f'
  nsExec::ExecToLog 'reg add "HKCU\Software\Classes\Directory\shell\RR_OpenDrive" /v "Icon" /d "$INSTDIR\resources\assets\link-icon.ico" /f'
  nsExec::ExecToLog 'reg add "HKCU\Software\Classes\Directory\shell\RR_OpenDrive\command" /ve /d "\"$INSTDIR\RRightclickrr.exe\" --open-drive \"%V\"" /f'

  ; FOLDER: Copy Drive Link
  nsExec::ExecToLog 'reg add "HKCU\Software\Classes\Directory\shell\RR_CopyLink" /ve /d "Copy Drive Link" /f'
  nsExec::ExecToLog 'reg add "HKCU\Software\Classes\Directory\shell\RR_CopyLink" /v "Icon" /d "$INSTDIR\resources\assets\link-icon.ico" /f'
  nsExec::ExecToLog 'reg add "HKCU\Software\Classes\Directory\shell\RR_CopyLink\command" /ve /d "\"$INSTDIR\RRightclickrr.exe\" --get-url \"%V\"" /f'

  ; BACKGROUND: Sync this folder
  nsExec::ExecToLog 'reg add "HKCU\Software\Classes\Directory\Background\shell\RR_SyncDrive" /ve /d "Sync this folder to Google Drive" /f'
  nsExec::ExecToLog 'reg add "HKCU\Software\Classes\Directory\Background\shell\RR_SyncDrive" /v "Icon" /d "$INSTDIR\resources\assets\sync-icon.ico" /f'
  nsExec::ExecToLog 'reg add "HKCU\Software\Classes\Directory\Background\shell\RR_SyncDrive\command" /ve /d "\"$INSTDIR\RRightclickrr.exe\" --sync-folder \"%V\"" /f'

  ; BACKGROUND: Copy this folder
  nsExec::ExecToLog 'reg add "HKCU\Software\Classes\Directory\Background\shell\RR_CopyDrive" /ve /d "Copy this folder to Google Drive" /f'
  nsExec::ExecToLog 'reg add "HKCU\Software\Classes\Directory\Background\shell\RR_CopyDrive" /v "Icon" /d "$INSTDIR\resources\assets\copy-icon.ico" /f'
  nsExec::ExecToLog 'reg add "HKCU\Software\Classes\Directory\Background\shell\RR_CopyDrive\command" /ve /d "\"$INSTDIR\RRightclickrr.exe\" --copy-folder \"%V\"" /f'

  ; BACKGROUND: Open this folder in Drive
  nsExec::ExecToLog 'reg add "HKCU\Software\Classes\Directory\Background\shell\RR_OpenDrive" /ve /d "Open this folder in Google Drive" /f'
  nsExec::ExecToLog 'reg add "HKCU\Software\Classes\Directory\Background\shell\RR_OpenDrive" /v "Icon" /d "$INSTDIR\resources\assets\link-icon.ico" /f'
  nsExec::ExecToLog 'reg add "HKCU\Software\Classes\Directory\Background\shell\RR_OpenDrive\command" /ve /d "\"$INSTDIR\RRightclickrr.exe\" --open-drive \"%V\"" /f'

  ; BACKGROUND: Copy Drive Link
  nsExec::ExecToLog 'reg add "HKCU\Software\Classes\Directory\Background\shell\RR_CopyLink" /ve /d "Copy Drive Link" /f'
  nsExec::ExecToLog 'reg add "HKCU\Software\Classes\Directory\Background\shell\RR_CopyLink" /v "Icon" /d "$INSTDIR\resources\assets\link-icon.ico" /f'
  nsExec::ExecToLog 'reg add "HKCU\Software\Classes\Directory\Background\shell\RR_CopyLink\command" /ve /d "\"$INSTDIR\RRightclickrr.exe\" --get-url \"%V\"" /f'

  ; FILE: Open in Google Drive
  nsExec::ExecToLog 'reg add "HKCU\Software\Classes\*\shell\RR_OpenDrive" /ve /d "Open in Google Drive" /f'
  nsExec::ExecToLog 'reg add "HKCU\Software\Classes\*\shell\RR_OpenDrive" /v "Icon" /d "$INSTDIR\resources\assets\link-icon.ico" /f'
  nsExec::ExecToLog 'reg add "HKCU\Software\Classes\*\shell\RR_OpenDrive\command" /ve /d "\"$INSTDIR\RRightclickrr.exe\" --open-drive \"%1\"" /f'

  ; FILE: Copy Drive Link
  nsExec::ExecToLog 'reg add "HKCU\Software\Classes\*\shell\RR_CopyLink" /ve /d "Copy Drive Link" /f'
  nsExec::ExecToLog 'reg add "HKCU\Software\Classes\*\shell\RR_CopyLink" /v "Icon" /d "$INSTDIR\resources\assets\link-icon.ico" /f'
  nsExec::ExecToLog 'reg add "HKCU\Software\Classes\*\shell\RR_CopyLink\command" /ve /d "\"$INSTDIR\RRightclickrr.exe\" --get-url \"%1\"" /f'

  DetailPrint "Context menu registered."
!macroend

!macro customUnInstall
  DetailPrint "Removing context menu entries..."

  ; === REMOVE WINDOWS 11 SPARSE PACKAGE ===
  DetailPrint "Removing Windows 11 sparse package..."
  nsExec::ExecToLog 'powershell -ExecutionPolicy Bypass -Command "Get-AppxPackage -Name $\'Kepners.RRightclickrr$\' | Remove-AppxPackage -ErrorAction SilentlyContinue"'

  ; === REMOVE CLASSIC MENU ENTRIES ===
  DetailPrint "Removing classic context menu entries..."
  nsExec::ExecToLog 'reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\ShellIconOverlayIdentifiers\ RRightclickrrSynced" /f'
  nsExec::ExecToLog 'reg delete "HKCU\Software\Classes\CLSID\{7B3B5E52-A1F0-4C5E-9B8A-1C2D3E4F5A6F}" /f'
  nsExec::ExecToLog 'reg delete "HKCU\Software\Classes\Directory\shell\RR_SyncDrive" /f'
  nsExec::ExecToLog 'reg delete "HKCU\Software\Classes\Directory\shell\RR_CopyDrive" /f'
  nsExec::ExecToLog 'reg delete "HKCU\Software\Classes\Directory\shell\RR_OpenDrive" /f'
  nsExec::ExecToLog 'reg delete "HKCU\Software\Classes\Directory\shell\RR_CopyLink" /f'
  nsExec::ExecToLog 'reg delete "HKCU\Software\Classes\Directory\Background\shell\RR_SyncDrive" /f'
  nsExec::ExecToLog 'reg delete "HKCU\Software\Classes\Directory\Background\shell\RR_CopyDrive" /f'
  nsExec::ExecToLog 'reg delete "HKCU\Software\Classes\Directory\Background\shell\RR_OpenDrive" /f'
  nsExec::ExecToLog 'reg delete "HKCU\Software\Classes\Directory\Background\shell\RR_CopyLink" /f'
  nsExec::ExecToLog 'reg delete "HKCU\Software\Classes\*\shell\RR_OpenDrive" /f'
  nsExec::ExecToLog 'reg delete "HKCU\Software\Classes\*\shell\RR_CopyLink" /f'
  nsExec::ExecToLog 'reg delete "HKCU\Software\Classes\Directory\shell\SyncToGoogleDrive" /f'
  nsExec::ExecToLog 'reg delete "HKCU\Software\Classes\Directory\shell\CopyToGoogleDrive" /f'
  nsExec::ExecToLog 'reg delete "HKCU\Software\Classes\Directory\shell\OpenInGoogleDrive" /f'
  nsExec::ExecToLog 'reg delete "HKCU\Software\Classes\Directory\shell\GetDriveLink" /f'
  nsExec::ExecToLog 'reg delete "HKCU\Software\Classes\Directory\Background\shell\SyncToGoogleDrive" /f'
  nsExec::ExecToLog 'reg delete "HKCU\Software\Classes\*\shell\OpenInGoogleDrive" /f'
  nsExec::ExecToLog 'reg delete "HKCU\Software\Classes\*\shell\GetDriveLink" /f'

  DetailPrint "Context menu entries removed."
!macroend
