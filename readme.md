# Simple-Bookmark

**Simple-Bookmark** is a lightweight VS Code extension designed to help you navigate your workspace faster by bookmarking frequently used files and folders.

## Key Features

- **Easy Bookmarking**: Add files and folders to the bookmark view directly from the Explorer.
- **Quick Navigation**: Jump to bookmarked items instantly.
- **Real-time Sync**: Automatically detects file changes and updates bookmark status.
- **File Management**: Copy, paste, rename, and delete files directly within the bookmark view.
- **Status Indicators**: Visual cues for synced, modified, or missing files.

## Shortcuts

| Key | Action |
| :--- | :--- |
| `Shift`+`Alt`+`A` | Add Bookmark |
| `Shift`+`Alt`+`D` | Remove Bookmark |
| `Shift`+`Alt`+`R` | Rename Bookmark |
| `Shift`+`Alt`+`Y` | Expand Folder / Explorer |
| `Ctrl`+`C` / `V` | Copy / Paste (in view) |

> *Shortcuts work when the Simple-Bookmark view is focused.*

## Settings

| Setting | Default | Description |
| :--- | :--- | :--- |
| `autoRefresh` | `true` | Automatically refresh bookmarks on file changes. |
| `showSyncStatus` | `true` | Display sync status (e.g., missing, modified) for items. |
| `deleteMode` | `"ask"` | Delete behavior: `"ask"`, `"bookmarkOnly"`, or `"bookmarkAndOriginal"`. |

## License

Apache-2.0
