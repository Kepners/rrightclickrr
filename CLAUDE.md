# RRightclickrr

## Project Overview
**RRightclickrr** - Right click to upload to Google Drive

| Item | Value |
|------|-------|
| Type | Desktop App (Electron) |
| Repo | github.com/Kepners/rrightclickrr |
| Hosting | GitHub Releases |
| Auth | Google OAuth 2.0 |

---

## Key Documentation
| Doc | Purpose |
|-----|---------|
| [docs/SPEC.md](docs/SPEC.md) | Project specification |
| [ARCHITECTURE.md](ARCHITECTURE.md) | System design |
| [.claude/CLAUDE.md](.claude/CLAUDE.md) | Session memory |

---

## Design System

### Color Palette
| Color | Hex | Name | Use |
|-------|-----|------|-----|
| Primary | `#2C6E49` | Turf Green | Title bar, main accents |
| Secondary | `#4C956C` | Sea Green | Status bar, secondary UI |
| Light | `#FEFEE3` | Light Yellow | Text on dark backgrounds |
| Accent | `#FFC9B9` | Powder Blush | Highlights, notifications |
| Warm | `#D68C45` | Toasted Almond | Active states, buttons |

---

## Environment Variables
```env
# Google OAuth
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# Build
GH_TOKEN=  # For GitHub releases
```

---

## Development

### Tech Stack
- **Electron** - Desktop framework
- **Google Drive API** - File uploads
- **Windows Shell Extension** - Context menu integration

### Key Features
- Right-click any file → "Upload to Google Drive"
- Progress indicator in system tray
- Auto-organize by file type (optional)
- Share link copied to clipboard after upload

---

*Created: January 18, 2026*
