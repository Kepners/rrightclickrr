# RRightclickrr Shell Extension

This folder contains the Windows 11 modern context menu shell extension.

## What This Does

Windows 11 changed how context menus work. The old registry-based entries only appear under "Show more options". To appear in the **main** context menu, you need:

1. A native C++ DLL implementing `IExplorerCommand`
2. A "sparse" MSIX package for app identity
3. Proper manifest registration

## Building

### Prerequisites

- **Visual Studio 2022** with C++ Desktop Development workload
- **CMake** 3.20 or later
- **Windows SDK** 10.0.19041.0 or later

### Build Steps

1. Open **Developer Command Prompt for VS 2022**
2. Navigate to `shell-extension` folder
3. Run:
   ```batch
   build.bat
   ```
4. Output will be in `shell-extension\dist\RRightclickrrShell.dll`

### Manual Build

```batch
mkdir build
cd build
cmake -G "Visual Studio 17 2022" -A x64 ..
cmake --build . --config Release
```

## Files

| File | Purpose |
|------|---------|
| `src/dllmain.cpp` | DLL entry point and COM class factory |
| `src/ExplorerCommand.cpp` | IExplorerCommand implementation |
| `src/ExplorerCommand.h` | Header file |
| `AppxManifest.xml` | Sparse package manifest |
| `CMakeLists.txt` | CMake build configuration |
| `RRightclickrrShell.def` | DLL export definitions |

## How It Works

1. **Installer** copies the DLL and manifest to `shell-extension\` subfolder
2. **Installer** registers the sparse package with `Add-AppxPackage -Register`
3. **Windows** reads the manifest and loads the DLL for context menu
4. **User right-clicks** → DLL provides menu items via `IExplorerCommand`
5. **User clicks item** → DLL launches `RRightclickrr.exe` with arguments

## GUIDs

| Command | GUID |
|---------|------|
| Sync to Drive | `{7B3B5E52-A1F0-4C5E-9B8A-1C2D3E4F5A6B}` |
| Copy to Drive | `{7B3B5E52-A1F0-4C5E-9B8A-1C2D3E4F5A6C}` |
| Get Drive URL | `{7B3B5E52-A1F0-4C5E-9B8A-1C2D3E4F5A6D}` |

## Troubleshooting

### Menu items not showing
1. Check if sparse package is registered: `Get-AppxPackage -Name "Kepners.RRightclickrr"`
2. Restart Explorer: `taskkill /f /im explorer.exe && start explorer.exe`
3. Check Event Viewer for COM errors

### DLL not loading
1. Ensure VC++ Runtime is installed
2. Check DLL dependencies with `dumpbin /dependents RRightclickrrShell.dll`

## Credits

Based on [microsoft/vscode-explorer-command](https://github.com/microsoft/vscode-explorer-command)
