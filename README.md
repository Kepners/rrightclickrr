# RRightclickrr

**Right-click any folder to sync it to Google Drive.**

![Version](https://img.shields.io/badge/version-1.0.0-green)
![Platform](https://img.shields.io/badge/platform-Windows-blue)
![License](https://img.shields.io/badge/license-MIT-yellow)

## Features

- **Sync to Google Drive** - Right-click any folder → syncs entire folder structure to Drive
- **Get Drive URL** - Right-click synced folder → instantly copies Drive URL to clipboard
- **No browser needed** - Get URLs for synced folders without logging in
- **Progress notifications** - See upload progress in system tray
- **Folder mappings** - Map local folders to specific Drive locations

## Installation

### From Release (Recommended)
1. Download the latest release from [GitHub Releases](https://github.com/Kepners/rrightclickrr/releases)
2. Run the installer
3. Context menu entries are automatically added

### From Source
```bash
# Clone the repo
git clone https://github.com/Kepners/rrightclickrr.git
cd rrightclickrr

# Install dependencies
npm install

# Run in development
npm start

# Build installer
npm run build:win
```

## Setup

### 1. Google Cloud Console Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or select existing)
3. Enable the **Google Drive API**
4. Go to **Credentials** → **Create Credentials** → **OAuth 2.0 Client ID**
5. Select **Desktop App** as the application type
6. Copy the **Client ID** and **Client Secret**

### 2. Configure the App

Create a `.env` file in the project root:
```env
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
```

### 3. Sign In

1. Open the app from system tray
2. Click "Sign in with Google"
3. Authorize access to Google Drive

### 4. Enable Context Menu

1. Open Settings (double-click tray icon)
2. Click "Enable Right-Click Menu"
3. Restart Explorer or reboot for changes to take effect

## Usage

### Sync a Folder
1. Right-click any folder in Windows Explorer
2. Select **"Sync to Google Drive"**
3. Wait for sync to complete
4. Share link is automatically copied to clipboard

### Get Drive URL
1. Right-click a previously synced folder
2. Select **"Get Google Drive URL"**
3. URL is copied to clipboard (no login required!)

### Folder Mappings
Configure specific local folders to sync to specific Drive folders:
1. Open Settings
2. Click "Add Folder Mapping"
3. Select local folder and Drive destination

## How It Works

```
Right-click folder
     ↓
Context menu: "Sync to Google Drive"
     ↓
Electron app receives folder path
     ↓
Recursively uploads all files to Drive
     ↓
Tracks sync in local database
     ↓
Share link copied to clipboard
```

## Windows 11 Note

On Windows 11, the context menu items appear under **"Show more options"** (the classic context menu). Native Windows 11 modern menu integration is planned for v2.0.

## Tech Stack

- **Electron** - Desktop app framework
- **Google Drive API v3** - File operations
- **electron-store** - Local configuration
- **keytar** - Secure token storage

## Color Palette

| Color | Hex | Use |
|-------|-----|-----|
| Turf Green | `#2C6E49` | Primary |
| Sea Green | `#4C956C` | Secondary |
| Light Yellow | `#FEFEE3` | Text |
| Powder Blush | `#FFC9B9` | Accent |
| Toasted Almond | `#D68C45` | Warm |

## License

MIT

## Roadmap

- [ ] Overlay icons on synced folders (Google "G" badge)
- [ ] Windows 11 modern context menu integration
- [ ] Auto-sync on file changes (watch mode)
- [ ] macOS support

---

Made with 🌿 by [Kepners](https://github.com/Kepners)
