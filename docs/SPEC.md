# RRightclickrr - Specification

## Overview
Right click any file to instantly upload it to Google Drive.

## Goals
- [ ] One-click upload to Google Drive
- [ ] Native Windows context menu integration
- [ ] Progress indicator
- [ ] Auto-copy share link

## User Stories
- As a user, I want to right-click a file and upload it to Drive without opening a browser
- As a user, I want to see upload progress in the system tray
- As a user, I want the share link automatically copied to my clipboard
- As a user, I want to choose which Drive folder to upload to

## Technical Requirements
- **Framework**: Electron
- **Auth**: Google OAuth 2.0
- **API**: Google Drive API v3
- **Platform**: Windows (initially), macOS later
- **Shell Integration**: Windows Registry for context menu

## MVP Features
1. Right-click → Upload to Google Drive
2. Google OAuth sign-in (one-time)
3. Upload progress notification
4. Share link copied to clipboard

## Future Features
- Choose destination folder
- Auto-organize by file type
- Upload history
- macOS support
- Batch upload (multiple files)

## Design Requirements
- Minimal UI - mostly system tray
- Native Windows notifications
- Clean installer

---

*Status: DRAFT - Needs review*
