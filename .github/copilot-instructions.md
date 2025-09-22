## Simple-Bookmark – AI Coding Agent Instructions

Purpose: Enable an AI agent to quickly extend or refactor this VS Code extension without re-discovering core architecture or conventions. Keep responses concise, action-oriented, and aligned with existing patterns.

# IMPORTANT 1

1. Please update the following rules in your memory
2. I will apply these rules to all future conversations
3. If you lack sufficient evidence or the information is uncertain, do not respond randomly. Instead, respond with "I don't know" or "I have insufficient evidence".
4. Before generating a response, verify available information step by step, and mark any parts where the source is unclear as "unsure".
5. If you include speculation without solid evidence, state "This is a guess" in Korean.
6. Structure your response to be detailed, objective, and professional.
7. Keep your answers non-repetitive.
8. Never suggest that I should seek information elsewhere.
9. Focus on the core points of the question to understand my intent.
10. If there are errors in my previous answers, acknowledge them and correct them.
11. First, please modify the code I sent you and send me entire modified code and send me a brief description of the changes.

# IMPORTANT 2

1. Please reply in "Korean" unless requested in English.
2. Never change comments in the code I send, even if they are simple "-----" lines.
3. Whenever possible, use the ternary operator or symbols like '&&' for conditional statements to make them more compact.
4. All if statements must use braces { } and proper line breaks/indentation, especially when they contain return statements.
5. Use single spaces around assignment operators (=) and avoid excessive spacing for alignment.
6. Use line breaks and indentation!
7-1. Never write "if" statements on a single line. Always use braces { } even for single-line statements.
7-2. Use "}
	else" or "}
	catch" instead of "}else" or "}catch".
7-3. Convert all single-line if statements like "if (condition) return value;" to:
	"if (condition) {
			return value;
	}"

### 1. Big Picture
- This is a VS Code explorer-side tree view extension (view id: `Simple-Bookmark`, label shown as `BOOKMARK`).
- Core concept: A lightweight index of user-selected filesystem items stored as metadata JSON files inside a workspace-local folder: `.bookmark/` (NOT global storage).
- Each root bookmark = one `<name>.bookmark.json` file containing metadata (original path, type, timestamps, existence flag). No separate in-memory DB beyond Maps.
- Real files/folders live in their original locations; removal normally only deletes metadata unless user opts to delete originals.
- Status tracking (SYNCED | MISSING | MODIFIED | ERROR) is stored in memory (`bookmarkStatusMap`) and rendered via ThemeIcon + description.

### 2. Runtime Flow
1. `activate()` (in `src/extension.ts`) determines workspace root → builds provider + command manager → creates TreeView.
2. `createBookmarkProvider()` (state + TreeDataProvider) lazily initializes `.bookmark` folder, loads metadata, wires sync + file ops services, manages selection/copy/paste state.
3. `BookmarkSyncService` watches each original file (per‑file watchers, no global deep watcher) and maintains metadata Maps + status callbacks.
4. `BookmarkOperationService` performs physical FS mutations (copy/paste overwrite, recursive folder copy, create file/folder) – always overwrites targets intentionally.
5. `BookmarkCommand` registers user commands; selection is tracked separately (not relying solely on TreeView selection argument to support multi operations).

### 3. Key Files / Responsibilities
- `extension.ts`: lifecycle wiring only. Avoid business logic here.
- `providers/BookmarkProvider.ts`: State orchestration, debounced refresh (150ms), root vs virtual children logic, cycle prevention using `_ancestorPaths` on TreeItems.
- `services/BookmarkSyncService.ts`: Metadata persistence + per-item FS watchers; delayed status reconciliation on load.
- `services/BookmarkOperationService.ts`: Destructive-safe overwrites; flattening logic for folder → file list when root pasting.
- `commands/BookmarkCommand.ts`: Command registration + user prompts (QuickPick/InputBox) + config-driven confirmations.
- `models/BookmarkSystemItem.ts`: UI adaptation of metadata (status-driven icon/description/tooltip/command binding).
- `utils/BookmarkPathUtil.ts`: Path derivation + filename validation (minimal rule set).

### 4. Data & State Conventions
- Metadata file suffix: `.bookmark.json` (constant in SyncService).
- In-memory Maps keyed by original absolute path, NOT bookmark name.
- Bookmark renames: rename original file/folder first (ensuring unique FS name), then metadata file; watchers are re-bound.
- Duplicate root bookmark names are auto-suffixed (`_1`, `_2` …) both for metadata name collisions and for FS rename uniqueness.
- Child (non-root) rename uses direct FS rename (with extension preservation logic if missing a dot) inside provider, not SyncService.
- Status resolution: Only SYNCED vs MISSING currently effective; MODIFIED is reserved (some hooks exist but no diff logic yet). Don’t add expensive hashing without design note.

### 5. Refresh & Performance
- UI refresh is debounced; call `provider.refresh()` after any batch ops (copy/paste/remove/rename). Don’t fire your own TreeDataProvider events manually.
- Avoid adding global watchers—pattern is per-bookmark watcher + on-demand status check.

### 6. Commands / Interaction Pattern
- New commands must be contributed in `package.json` (activationEvents + contributes.commands + menus/keybindings if needed) and registered in `BookmarkCommand` factory.
- Multi-selection behavior: Logic prefers explicit `selected` array param, then internal `selectedBookmarks`, then fallback item.
- Copy/Paste: Provider keeps a de-duplicated array of `vscode.Uri` (original paths). Root paste → name matching across root file bookmarks (`pasteItemsToRoot`).

### 7. User Configuration (package.json contributes.configuration)
`Simple-Bookmark.autoRefresh`, `showSyncStatus`, `confirmDelete`, `confirmDeleteOriginal`. Honor existing confirm flags when adding destructive features (mirror prompt style in removeBookmark flow).

### 8. Error / UX Patterns
- User feedback via `vscode.window.showInformationMessage` / `showWarningMessage` / `showErrorMessage` is immediate and short; console.debug used for verbose tracing (`[Simple-Bookmark.*]`). Match tag prefix.
- Swallow low-risk FS errors (e.g., deleting non-existent) but surface critical add/remove failures.

### 9. Adding Features – Examples
- Add a filter feature: Extend provider to pre-filter in `getRootBookmarks()` before sorting; expose a setter + call `refresh()`; do NOT mutate TreeItem after creation except via `updateStatus`.
- Add diff detection: Enhance `BookmarkSyncService.syncBookmark` to compare mtime or hash (compute only for files; gate behind new config flag).
- Add bulk operations: Reuse existing Maps; prefer batching before a single `refresh()`.

### 10. Build / Dev Workflow
- TypeScript only; compile: `npm run compile` (outputs to `out/`). Watch: `npm run watch`.
- Packaging: `npm run vsce` (runs compile then `vsce package`) → produces `.vsix` (examples present: `simple-bookmark-<version>.vsix`).
- No test suite implemented yet despite devDeps (mocha, @vscode/test-electron) – avoid inventing test folders unless requested.

### 11. Style & Patterns to Preserve
- Explicit factory functions (`createBookmarkProvider`, `createBookmarkSyncService`, etc.) returning plain objects (no classes) – continue this pattern for new subsystems.
- Keep modules side-effect light; initialization is explicit (except `setTimeout` bootstrap in provider for async folder prep).
- Use strict TypeScript; favor narrow return types over `any` (current code is strongly typed, keep it).

### 12. Safe Extension Points
- Add status types: Extend `BookmarkStatus` enum + adapt `setupDisplay` switch.
- Inject new context menu actions: Update `package.json` menus → implement command → reuse provider/service operations.
- Additional metadata fields: Update interface + serialization in SyncService (`saveMetadata`/`loadMetadata`). Maintain backward compatibility by making new fields optional.

### 13. Anti-Patterns (Avoid)
- Don’t add global recursive FS watchers (performance + noise).
- Don’t mutate TreeItem properties outside creation or `updateStatus` path unpredictably.
- Don’t store relative paths; absolute original paths are required for watcher stability.
- Don’t introduce blocking, heavy hashing in save events without debounce/config.

### 14. Quick Capability Checklist for Agent Responses
- When modifying metadata logic → update both persistence and any maps + re-bind watcher if path changed.
- After any operation that changes visible items → call `provider.refresh()` (once, debounced).
- New destructive commands → honor `confirmDelete` / `confirmDeleteOriginal` patterns.

---
If something is ambiguous (e.g., introducing modified status detection or multi-root workspace behavior), surface a clarification question instead of guessing hidden assumptions.