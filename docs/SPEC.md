# RRightclickrr - Specification

## Overview
Right-click any folder to instantly sync it to Google Drive, maintaining folder structure. Get the Drive URL anytime without logging in.

## Goals
- [x] One-click sync folders to Google Drive
- [x] Native Windows context menu integration
- [x] Progress notifications
- [x] Auto-copy share link
- [x] Get Drive URL for synced folders (no login needed)
- [ ] Overlay icons on synced folders (native shell extension)

## User Stories
- As a user, I want to right-click a folder and sync it to Drive without opening a browser
- As a user, I want to see sync progress in the system tray
- As a user, I want the share link automatically copied to my clipboard
- As a user, I want to right-click a synced folder and get its Drive URL instantly
- As a user, I want to see which folders have been synced (overlay icon)
- As a user, I want to map local folders to specific Drive locations

## Technical Requirements
- **Framework**: Electron
- **Auth**: Google OAuth 2.0
- **API**: Google Drive API v3
- **Platform**: Windows 10/11
- **Shell Integration**: Windows Registry for context menu
- **Overlay Icons**: Native Shell Extension (C#) - Future

## Context Menu Items

### 1. Sync to Google Drive
- **Location**: Right-click on any folder
- **Behavior**: Recursively uploads all files/folders to Drive
- **Maintains**: Folder structure
- **Result**: Share link copied to clipboard, folder tracked locally

### 2. Get Google Drive URL
- **Location**: Right-click on any synced folder
- **Behavior**: Looks up local sync database, copies URL to clipboard
- **No auth required**: Works offline using cached data

## Current Features (v1.0)
1. Right-click folder → "Sync to Google Drive"
2. Right-click folder → "Get Google Drive URL"
3. Google OAuth sign-in (one-time)
4. Upload progress notification
5. Share link copied to clipboard
6. Local sync tracking database
7. Folder mapping configuration
8. Settings UI (system tray app)

## Future Features
- Overlay icons on synced folders (Google "G" badge)
- Windows 11 modern context menu top bar integration
- Auto-sync on file changes (watch mode)
- Conflict resolution for changed files
- macOS support
- Batch sync multiple folders

## Design Requirements
- Minimal UI - mostly system tray
- Native Windows notifications
- Clean installer with auto context menu setup
- No browser required for "Get URL" feature

## File Tracking
Synced folders are tracked in a local JSON database:
- Local path → Drive ID mapping
- Drive URL for each synced folder
- Sync timestamp

---

*Status: IMPLEMENTED - v1.0*
