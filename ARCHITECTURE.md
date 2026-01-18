# RRightclickrr - Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                       Windows Explorer                           │
│                                                                   │
│   User right-clicks folder → Context menu appears                 │
│       • "Sync to Google Drive"                                    │
│       • "Get Google Drive URL"                                    │
└─────────────────────────┬────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Registry Shell Extension                       │
│                                                                   │
│   HKCU\Software\Classes\Directory\shell\SyncToGoogleDrive        │
│   HKCU\Software\Classes\Directory\shell\GetGDriveUrl             │
│                                                                   │
│   → Launches: RRightclickrr.exe --sync-folder "path"             │
│   → Launches: RRightclickrr.exe --get-url "path"                 │
└─────────────────────────┬────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Electron Main Process                          │
│                                                                   │
│   main.js                                                         │
│   ├── Command line args parser                                    │
│   ├── System tray icon & menu                                     │
│   ├── Settings window (BrowserWindow)                             │
│   ├── Notifications                                               │
│   └── IPC handlers                                                │
│                                                                   │
│   Components:                                                     │
│   ├── GoogleAuth (src/lib/google-auth.js)                        │
│   ├── DriveUploader (src/lib/drive-uploader.js)                  │
│   ├── FolderSync (src/lib/folder-sync.js)                        │
│   ├── SyncTracker (src/lib/sync-tracker.js)                      │
│   └── ContextMenu (src/lib/context-menu.js)                      │
└─────────────────────────┬────────────────────────────────────────┘
                          │
            ┌─────────────┴─────────────┐
            ▼                           ▼
┌───────────────────────┐   ┌───────────────────────────────────┐
│    Google Drive API    │   │         Local Storage              │
│                        │   │                                    │
│ • OAuth 2.0 tokens     │   │ electron-store:                    │
│ • File upload          │   │ ├── rrightclickrr-config.json     │
│ • Folder creation      │   │ │   ├── folderMappings            │
│ • Get share links      │   │ │   ├── showNotifications         │
│                        │   │ │   └── hasRunBefore              │
│                        │   │ └── rrightclickrr-sync-db.json    │
│                        │   │     └── syncedItems{}             │
│                        │   │                                    │
│                        │   │ keytar:                            │
│                        │   │ └── OAuth tokens (encrypted)       │
└───────────────────────┘   └───────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────────────┐
│                        Clipboard                                  │
│                                                                   │
│   • Share link (after sync)                                       │
│   • Drive URL (on "Get URL" action)                              │
└─────────────────────────────────────────────────────────────────┘
```

## Directory Structure

```
rrightclickrr/
├── main.js                 # Electron main process entry
├── preload.js              # Context bridge for IPC
├── package.json            # Dependencies & build config
├── installer.nsh           # NSIS installer script
│
├── src/
│   ├── lib/
│   │   ├── google-auth.js      # OAuth 2.0 flow
│   │   ├── drive-uploader.js   # Drive API operations
│   │   ├── folder-sync.js      # Recursive folder sync
│   │   ├── sync-tracker.js     # Local sync database
│   │   └── context-menu.js     # Registry management
│   │
│   └── ui/
│       ├── index.html          # Settings window
│       ├── styles.css          # UI styling
│       └── renderer.js         # UI logic
│
├── assets/
│   ├── tray-icon.png           # System tray icon
│   ├── icon.png                # App icon
│   ├── sync-icon.ico           # Context menu icon
│   └── link-icon.ico           # Get URL icon
│
└── docs/
    └── SPEC.md                 # Feature specification
```

## Data Flow

### Sync Flow
```
1. User right-clicks folder → "Sync to Google Drive"
2. Shell launches: RRightclickrr.exe --sync-folder "C:\path\to\folder"
3. Electron receives args, calls handleFolderUpload()
4. GoogleAuth checks token validity (refresh if needed)
5. FolderSync.syncFolder():
   a. Scan local folder recursively
   b. Create matching folder structure in Drive
   c. Upload each file with progress updates
   d. Track sync in SyncTracker database
6. Copy share link to clipboard
7. Show Windows notification: "Sync complete!"
```

### Get URL Flow
```
1. User right-clicks synced folder → "Get Google Drive URL"
2. Shell launches: RRightclickrr.exe --get-url "C:\path\to\folder"
3. Electron receives args, calls handleGetUrl()
4. SyncTracker.getSyncInfo() looks up local database
5. If found: Copy driveUrl to clipboard
6. Show notification: "URL copied!"
```

## Security

### Token Storage
- OAuth tokens encrypted with AES-256-CBC
- Stored via `keytar` in Windows Credential Manager
- Never stored in plain text

### Permissions
- `drive.file`: Access to files created by app
- `drive.metadata.readonly`: Read folder structure

### Registry
- Context menu entries in HKCU (per-user, no admin required)
- Cleaned up on uninstall via NSIS script

## Future: Windows 11 Modern Context Menu

The current implementation uses classic shell extension (registry-based), which appears in:
- Windows 10: Directly in context menu
- Windows 11: Under "Show more options" (classic menu)

For native Windows 11 modern context menu (top command bar), requires:
- Native shell extension DLL (C# or C++)
- Implements `IExplorerCommand` COM interface
- Registered via MSIX package or COM registration

This is planned for v2.0.

## Future: Overlay Icons

To show sync status icons on folders (like OneDrive):
- Implement `IShellIconOverlayIdentifier` COM interface
- Native DLL registration in registry
- Query SyncTracker database for sync status

---

*Last Updated: January 18, 2026*
