# 🚀 Simple-Bookmark - The Ultimate BookmarkExplorer for VSCode

- To avoid shortcut conflicts with VS Code or other extensions
- Simple-Bookmark's shortcuts are context-aware and only active when the sidebar is visible.
- Check your keybindings: `"when": "view.Simple-Bookmark.visible"`
- Configure deletion behavior in settings: `Simple-Bookmark.deleteMode` (ask/bookmarkOnly/bookmarkAndOriginal)timate BookmarkExplorer for VSCode

![demo](logo_demonstration.gif)

## ⚡️ Features

- ***Add and remove bookmarks  :*** (folders & files) with a single click or keyboard shortcut
- ***Lightning-fast navigation  :*** Instantly open, focus, or reveal any bookmarked path
- ***Explorer folder expansion  :*** Expand all VS Code Explorer folders at once with performance optimization
- ***Flexible deletion options  :*** Choose to delete bookmark only or bookmark + original files
- ***Non-destructive by default  :*** Removing a bookmark keeps original files safe unless specified otherwise
- ***Session persistence  :*** Your bookmarks are saved automatically and restored across VS Code restarts (by default)
- ***Bulk management  :*** Quickly reset or clear all bookmarks in a single action
- ***Zero scroll  :*** Perfect for giant repos, monorepos, or rapid project switching

## 🖱️ Quick Actions

| Action                        | How To                                 |
|-------------------------------|----------------------------------------|
| Add bookmark                  | Right-click file/folder → **Add** or use `Shift+Alt+A` |
| Remove bookmark               | Right-click bookmark → **Remove** or use `Shift+Alt+D` (*choose bookmark only or + original files*) |
| Expand all Explorer folders   | Use `Shift+Alt+Y` or right-click folder → **Expand All** |
| Expand specific folder        | Right-click folder → **Expand Folder** |
| Reveal file/folder in explorer| Click bookmark or `Shift+Alt+S`        |
| Refresh list                  | Click **Refresh** (🔄) in sidebar      |
| Remove all bookmarks          | Click **RemoveAll** (🗑️) in sidebar (*with deletion options*) |

## 💡 Tips

- To avoid shortcut conflicts with VS Code or other extensions
- Simple-Bookmark’s shortcuts are context-aware and only active when the sidebar is visible.
- Check your keybindings: `"when": "view.Simple-Bookmark.visible"`

## 🚧 Roadmap

- Add filter/ignore rules by extension or filename pattern
- Multi-select and bulk operations
- Drag-and-drop reordering
- Smart context actions (move/copy/open-in-terminal)
- More keyboard shortcuts (configurable)

## 🛠️ Under the Hood

- Built for maximum speed, clarity, and zero risk
- Designed for large teams, polyrepo, monorepo, or any developer who hates scrolling

## 📢 Contributing

- Pull requests, feedback, and bug reports are always welcome!
- Help make Simple-Bookmark the best project explorer for real-world VS Code power users.
