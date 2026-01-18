; Custom NSIS installer script for RRightclickrr
; This registers the context menu entries on install and removes them on uninstall

!macro customInstall
  ; Register context menu entries using PowerShell
  DetailPrint "Registering Windows context menu..."

  ; Create the PowerShell script content
  nsExec::ExecToLog 'powershell -ExecutionPolicy Bypass -Command "\
    $exePath = \"$INSTDIR\\RRightclickrr.exe\"; \
    $iconPath = \"$INSTDIR\\resources\\app\\assets\\sync-icon.ico\"; \
    $linkIconPath = \"$INSTDIR\\resources\\app\\assets\\link-icon.ico\"; \
    \
    # Sync to Google Drive - Directory context menu \
    $syncPath = \"HKCU:\\Software\\Classes\\Directory\\shell\\SyncToGoogleDrive\"; \
    New-Item -Path $syncPath -Force | Out-Null; \
    Set-ItemProperty -Path $syncPath -Name \"(Default)\" -Value \"Sync to Google Drive\"; \
    Set-ItemProperty -Path $syncPath -Name \"Icon\" -Value $iconPath; \
    Set-ItemProperty -Path $syncPath -Name \"Position\" -Value \"Top\"; \
    New-Item -Path \"$syncPath\\command\" -Force | Out-Null; \
    Set-ItemProperty -Path \"$syncPath\\command\" -Name \"(Default)\" -Value \"\`\"$exePath\`\" --sync-folder \`\"%V\`\"\"; \
    \
    # Sync - Directory Background \
    $bgSyncPath = \"HKCU:\\Software\\Classes\\Directory\\Background\\shell\\SyncToGoogleDrive\"; \
    New-Item -Path $bgSyncPath -Force | Out-Null; \
    Set-ItemProperty -Path $bgSyncPath -Name \"(Default)\" -Value \"Sync this folder to Google Drive\"; \
    Set-ItemProperty -Path $bgSyncPath -Name \"Icon\" -Value $iconPath; \
    New-Item -Path \"$bgSyncPath\\command\" -Force | Out-Null; \
    Set-ItemProperty -Path \"$bgSyncPath\\command\" -Name \"(Default)\" -Value \"\`\"$exePath\`\" --sync-folder \`\"%V\`\"\"; \
    \
    # Get Google Drive URL - Directory context menu \
    $urlPath = \"HKCU:\\Software\\Classes\\Directory\\shell\\GetGDriveUrl\"; \
    New-Item -Path $urlPath -Force | Out-Null; \
    Set-ItemProperty -Path $urlPath -Name \"(Default)\" -Value \"Get Google Drive URL\"; \
    Set-ItemProperty -Path $urlPath -Name \"Icon\" -Value $linkIconPath; \
    New-Item -Path \"$urlPath\\command\" -Force | Out-Null; \
    Set-ItemProperty -Path \"$urlPath\\command\" -Name \"(Default)\" -Value \"\`\"$exePath\`\" --get-url \`\"%V\`\"\"; \
  "'

  DetailPrint "Context menu registered successfully."
!macroend

!macro customUnInstall
  ; Remove context menu entries
  DetailPrint "Removing Windows context menu entries..."

  nsExec::ExecToLog 'powershell -ExecutionPolicy Bypass -Command "\
    Remove-Item -Path \"HKCU:\\Software\\Classes\\Directory\\shell\\SyncToGoogleDrive\" -Recurse -Force -ErrorAction SilentlyContinue; \
    Remove-Item -Path \"HKCU:\\Software\\Classes\\Directory\\Background\\shell\\SyncToGoogleDrive\" -Recurse -Force -ErrorAction SilentlyContinue; \
    Remove-Item -Path \"HKCU:\\Software\\Classes\\Directory\\shell\\GetGDriveUrl\" -Recurse -Force -ErrorAction SilentlyContinue; \
  "'

  DetailPrint "Context menu entries removed."
!macroend
