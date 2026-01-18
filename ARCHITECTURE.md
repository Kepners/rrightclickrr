# RRightclickrr - Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────┐
│                    Windows Explorer                      │
│                                                          │
│   User right-clicks file → Context menu appears          │
│              "Upload to Google Drive"                    │
└─────────────────────────┬────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│                  Shell Extension                         │
│                                                          │
│   - Registered in Windows Registry                       │
│   - Launches Electron app with file path                 │
└─────────────────────────┬────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│                 Electron Main Process                    │
│                                                          │
│   - Receives file path via command line args             │
│   - Manages OAuth tokens                                 │
│   - Shows system tray icon & notifications               │
└─────────────────────────┬────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│                  Google Drive API                        │
│                                                          │
│   - OAuth 2.0 authentication                             │
│   - File upload with progress                            │
│   - Generate shareable link                              │
└─────────────────────────┬────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│                     Clipboard                            │
│                                                          │
│   - Share link automatically copied                      │
│   - Windows notification shown                           │
└──────────────────────────────────────────────────────────┘
```

## Components

### 1. Shell Extension
- **Location**: `src/shell-extension/`
- **Purpose**: Register context menu item in Windows
- **Implementation**: Registry keys + batch script OR native COM extension

### 2. Electron App
- **Location**: `main.js`, `src/`
- **Purpose**: Handle uploads, manage auth, show UI
- **Runs as**: Background process (system tray)

### 3. Google OAuth
- **Flow**: Desktop app OAuth 2.0
- **Storage**: Encrypted tokens in user data folder
- **Refresh**: Auto-refresh before expiry

### 4. Upload Manager
- **Location**: `src/uploader.js`
- **Features**:
  - Resumable uploads for large files
  - Progress tracking
  - Retry on failure

## Data Flow

1. User right-clicks file in Explorer
2. Windows shows "Upload to Google Drive" option
3. User clicks → Shell extension launches Electron
4. Electron checks OAuth token (prompts login if needed)
5. File uploaded to Drive with progress shown
6. Share link generated and copied to clipboard
7. Windows notification: "Uploaded! Link copied."

## Security

- OAuth tokens encrypted at rest
- No file data stored locally
- Minimal permissions: Drive file access only

---

*Last Updated: January 18, 2026*
