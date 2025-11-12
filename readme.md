# 🚀 Simple-Bookmark

Simple-Bookmark is a lightweight VS Code extension that lets you bookmark files and folders in the Explorer sidebar for fast navigation and simple management.

## Features ✨

- 🔖 Add and remove bookmarks (files & folders) from the Explorer or the extension view
- 📋 Copy & paste bookmarked items, rename bookmarks, and create files/folders in the original location
- 📂 Expand all workspace folders or expand a specific folder in the Explorer
- 🔁 Auto-refresh bookmarks on file changes and show per-item sync status
- 🗑️ Configurable delete behavior: ask / bookmarkOnly / bookmarkAndOriginal
- 💾 Session persistence and bulk operations (remove all, reset)

## Default shortcuts ⌨️

- Shift+Alt+A — ➕ Add bookmark
- Shift+Alt+D — ➖ Remove bookmark
- Shift+Alt+R — ✏️ Rename bookmark
- Shift+Alt+Y — 📂 Expand Explorer or expand a folder (context-aware)
- Ctrl+C / Ctrl+V — 📋 Copy / Paste inside the Simple-Bookmark view

Shortcuts are context-aware and active when the extension view is focused.

## Settings ⚙️

- 🔁 `Simple-Bookmark.autoRefresh` (boolean, default: `true`) — Auto-refresh on file changes
- 🔄 `Simple-Bookmark.showSyncStatus` (boolean, default: `true`) — Show synchronization status per item
- 🗑️ `Simple-Bookmark.deleteMode` (string, default: `"ask"`) — Default delete behavior: `"ask" | "bookmarkOnly" | "bookmarkAndOriginal"`

## Install ⬇️

- 📥 Install from the VS Code Marketplace by searching for "Simple-Bookmark".
- 🛠️ Local development: Node.js 18+, run `npm install` then `npm run compile` or `npm run watch`. Use `npm run vsce` to create a package.

## Contributing 🤝

- 📦 Repository: [Simple-Bookmark on GitHub](https://github.com/JUNGHO-GIT/SIMPLE-BOOKMARK)
- ✉️ PRs, bug reports, and suggestions are welcome.

## License 📄

- 🔓 Apache-2.0
