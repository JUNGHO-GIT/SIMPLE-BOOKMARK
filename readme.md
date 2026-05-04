# Simple-Bookmark

Simple-Bookmark is a VS Code extension that keeps file and folder bookmarks in a dedicated Explorer tree.
It is built for repeated workspace navigation, quick file operations, and low activation overhead.

## Features

- Bookmark files and folders from Explorer or the Simple-Bookmark view.
- Open bookmarked files directly from the tree.
- Copy and paste bookmarked items into folders or back to matching original paths.
- Rename, create, remove, and bulk-remove bookmark entries.
- Expand or collapse bookmark folders from the view title and item context menus.
- Reflect missing or restored original files through bookmark sync status.
- Limit broad Explorer folder expansion to protect VS Code responsiveness.

## Commands

| Command | Purpose |
| --- | --- |
| `Simple-Bookmark.addbookmark` | Add a selected file or folder to bookmarks. |
| `Simple-Bookmark.refreshentry` | Refresh the bookmark tree. |
| `Simple-Bookmark.copybookmark` | Copy selected bookmark targets. |
| `Simple-Bookmark.pastebookmark` | Paste copied items into a selected folder or resolved target. |
| `Simple-Bookmark.pasterootbookmark` | Paste copied files back to matching root bookmark targets. |
| `Simple-Bookmark.renamebookmark` | Rename a bookmark and its original file or folder when applicable. |
| `Simple-Bookmark.removebookmark` | Remove selected bookmarks, with optional original deletion. |
| `Simple-Bookmark.removeallbookmark` | Remove every root bookmark. |
| `Simple-Bookmark.createfolder` | Create a folder under a bookmarked folder. |
| `Simple-Bookmark.createfile` | Create a file under a bookmarked folder. |
| `Simple-Bookmark.expandexplorer` | Expand workspace folders in VS Code Explorer with a safety limit. |
| `Simple-Bookmark.expandfolder` | Expand one Explorer folder with a safety limit. |
| `Simple-Bookmark.expandbookmarkfolder` | Expand one bookmark folder in the Simple-Bookmark tree. |
| `Simple-Bookmark.expandallbookmarks` | Expand all bookmark folders. |
| `Simple-Bookmark.collapseallbookmarks` | Collapse all bookmark folders. |

## Keybindings

| Key | Context | Command |
| --- | --- | --- |
| `Shift+Alt+A` | Explorer or Simple-Bookmark view | Add bookmark |
| `Ctrl+C` | Simple-Bookmark view | Copy bookmark |
| `Ctrl+V` | Simple-Bookmark view | Paste bookmark |
| `Shift+Alt+D` | Simple-Bookmark view | Remove bookmark |
| `Shift+Alt+R` | Simple-Bookmark view | Rename bookmark |
| `Shift+Alt+Y` | Explorer | Expand selected Explorer folder or workspace folders |

## Settings

| Setting | Default | Description |
| --- | --- | --- |
| `Simple-Bookmark.logLevel` | `info` | Controls extension logging: `off`, `debug`, `info`, `warn`, `error`. |
| `Simple-Bookmark.autoRefresh` | `true` | Keeps bookmarks refreshed when watched files change. |
| `Simple-Bookmark.showSyncStatus` | `true` | Shows sync state for bookmark items. |
| `Simple-Bookmark.deleteMode` | `ask` | Chooses bookmark-only or bookmark-and-original deletion behavior. |

## Storage And Sync

Bookmark metadata is stored under the user home `.bookmark` directory, partitioned by workspace path.
The extension migrates legacy workspace `.bookmark` metadata when needed.

File sync uses directory-level VS Code file watchers shared by bookmarks in the same folder. Watch events are
filtered back to exact bookmarked paths, so the tree keeps the same visible behavior with fewer watcher objects.
Save and file-system change events are debounced before metadata sync to reduce Extension Host work.

## Build VSIX

```powershell
bun run tools
```

Select `tools --vsce` in the tool menu. The build bundles `src/extension.ts` to `out/extension.js`, copies required
runtime packages, and packages `simple-bookmark-4.2.1.vsix` with `vsce package --no-dependencies`.

## Development Notes

- Edit TypeScript sources under `src/`; do not edit generated `out/` files.
- Use `bunx tsc --noEmit` for type validation.
- Use `bunx biome check <files>` for focused lint and formatting diagnostics.
- Use the `tools --vsce` path for marketplace package validation.
