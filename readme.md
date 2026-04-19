# Simple-Bookmark

## Overview

Simple-Bookmark is a VS Code extension that stores file and folder bookmarks and
lets users operate on them from a dedicated tree view.

## Structure

* `src/commands/` handles bookmark-related user actions
* `src/providers/` builds the tree view data
* `src/services/` manages bookmark persistence and file operations
* `src/models/` defines bookmark view models
* `src/assets/` and `src/exports/` hold shared helpers and barrel exports

## Notes

* Bookmark metadata is stored outside the extension source tree.
* The generated `out/` directory is rebuilt from the TypeScript sources.
