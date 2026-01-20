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

  ; FILE: Open in Google Drive
  nsExec::ExecToLog 'reg add "HKCU\Software\Classes\*\shell\RR_OpenDrive" /ve /d "Open in Google Drive" /f'
  nsExec::ExecToLog 'reg add "HKCU\Software\Classes\*\shell\RR_OpenDrive" /v "Icon" /d "$INSTDIR\resources\assets\link-icon.ico" /f'
  nsExec::ExecToLog 'reg add "HKCU\Software\Classes\*\shell\RR_OpenDrive\command" /ve /d "\"$INSTDIR\RRightclickrr.exe\" --open-drive \"%1\"" /f'

  DetailPrint "Context menu registered."
!macroend

!macro customUnInstall
  DetailPrint "Removing context menu entries..."

  ; === REMOVE WINDOWS 11 SPARSE PACKAGE ===
  DetailPrint "Removing Windows 11 sparse package..."
  nsExec::ExecToLog 'powershell -ExecutionPolicy Bypass -Command "Get-AppxPackage -Name $\'Kepners.RRightclickrr$\' | Remove-AppxPackage -ErrorAction SilentlyContinue"'

  ; === REMOVE CLASSIC MENU ENTRIES ===
  DetailPrint "Removing classic context menu entries..."
  nsExec::ExecToLog 'reg delete "HKCU\Software\Classes\Directory\shell\RR_SyncDrive" /f'
  nsExec::ExecToLog 'reg delete "HKCU\Software\Classes\Directory\shell\RR_CopyDrive" /f'
  nsExec::ExecToLog 'reg delete "HKCU\Software\Classes\Directory\shell\RR_OpenDrive" /f'
  nsExec::ExecToLog 'reg delete "HKCU\Software\Classes\Directory\Background\shell\RR_SyncDrive" /f'
  nsExec::ExecToLog 'reg delete "HKCU\Software\Classes\Directory\Background\shell\RR_CopyDrive" /f'
  nsExec::ExecToLog 'reg delete "HKCU\Software\Classes\Directory\Background\shell\RR_OpenDrive" /f'
  nsExec::ExecToLog 'reg delete "HKCU\Software\Classes\*\shell\RR_OpenDrive" /f'

  DetailPrint "Context menu entries removed."
!macroend
