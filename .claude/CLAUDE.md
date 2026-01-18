# RRightclickrr - Session Memory

## Quick Reference
- **Repo**: github.com/Kepners/rrightclickrr
- **Workspace color**: #2C6E49 (Turf Green)
- **Type**: Desktop App (Electron)

---

## Color Palette
```
#2C6E49 - Turf Green (primary)
#4C956C - Sea Green (secondary)
#FEFEE3 - Light Yellow (text)
#FFC9B9 - Powder Blush (accent)
#D68C45 - Toasted Almond (warm)
```

---

## Architecture
```
User right-clicks file
    ↓ (Windows Shell Extension)
Context menu appears with "Upload to Google Drive"
    ↓ (IPC)
Electron main process
    ↓ (Google Drive API)
File uploaded → Share link copied to clipboard
```

---

## Key Files
| File | Purpose |
|------|---------|
| `main.js` | Electron main process |
| `preload.js` | Context bridge for IPC |
| `src/uploader.js` | Google Drive API integration |
| `src/shell-extension/` | Windows context menu registration |

---

## Known Issues
[None yet]

---

## Session Notes
- **Jan 18, 2026**: Project created, structure set up

---

*Last Updated: January 18, 2026*
