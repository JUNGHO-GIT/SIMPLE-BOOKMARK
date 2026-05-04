# simple-bookmark Architecture

## Runtime Surface

```text
package.json activationEvents
  -> src/extension.ts activate(context)
  -> BookmarkProvider(workspaceRoot)
  -> BookmarkCommand(provider, context)
  -> VS Code TreeView(Simple-Bookmark)
```

`src/extension.ts` owns activation, output logging setup, tree registration, selection tracking, workspace refresh,
configuration refresh, and disposable cleanup. The extension activates from the contributed view and command events.

## Source Map

```text
src/
|-- commands/
|   `-- BookmarkCommand.ts          command registration and user action routing
|-- providers/
|   `-- BookmarkProvider.ts         TreeDataProvider, bookmark tree state, copy/paste targets
|-- services/
|   |-- BookmarkSyncService.ts      metadata load/save, status checks, file watchers
|   `-- BookmarkOperationService.ts file and folder copy/create/delete operations
|-- models/
|   `-- BookmarkModel.ts            TreeItem model and status display
|-- assets/
|   |-- scripts/                    logger, notify, path, cache helpers
|   `-- types/                      ambient path aliases
`-- exports/                        barrel exports for local aliases
```

Generated files live in `out/` and are rebuilt by the VSIX tool path. They are not source of truth.

## Bookmark Storage

```text
workspace root
  -> getBookmarkPath(workspaceRoot)
  -> ~/.bookmark/<normalized-workspace-path>/
  -> *.bookmark.json metadata files
```

Each metadata file stores the original path, bookmark name, file/folder flag, timestamps, and existence state.
`BookmarkProvider` prepares the storage directory and migrates legacy workspace `.bookmark` metadata into the
central user-home storage path.

## Tree And Command Flow

```text
User command or tree context menu
  -> BookmarkCommand handler
  -> BookmarkProvider method
  -> BookmarkSyncService or BookmarkOperationService
  -> provider refresh event
  -> TreeView redraw
```

Commands stay thin: they resolve the selected item, confirm user intent, and delegate persistence or file-system work.
The provider owns tree state, expanded folder paths, copied bookmark snapshots, and root bookmark composition.
Services own metadata mutation, sync status, and direct file-system operations.

## Sync And Watcher Model

`BookmarkSyncService` loads metadata in batches, checks status in batches, and registers watchers by directory.
Multiple bookmarks in the same folder share one `FileSystemWatcher` using a `RelativePattern` for that folder.
Watcher callbacks filter events back to exact bookmarked paths before syncing or marking status.

```text
metadata originalPath
  -> dirname(originalPath)
  -> normalized watcher key
  -> shared directory watcher
  -> exact-path event filter
  -> debounced syncBookmark(originalPath)
```

This keeps visible results unchanged while reducing watcher count and activation cost for large bookmark sets.
The first provider refresh after metadata load fires immediately; later refresh requests remain debounced.

## Responsiveness Rules

- `Simple-Bookmark.logLevel=off` suppresses console and output-channel formatting work.
- Metadata load and status checks use batch size `50`.
- File save and watcher change sync are debounced per original path.
- Explorer recursive expansion stops at `250` folders and reports a warning instead of locking the UI.
- Sequential loops remain where VS Code commands or file mutations must preserve order and user-visible behavior.

## Build And Validation

```powershell
bunx tsc --noEmit
bunx biome check src/assets/scripts/logger.ts src/services/BookmarkSyncService.ts src/providers/BookmarkProvider.ts src/commands/BookmarkCommand.ts
bun run tools
```

For VSIX packaging, select `tools --vsce` from the `bun run tools` menu. That path bundles the extension with
esbuild, copies runtime dependencies, and runs `vsce package --no-dependencies`.
