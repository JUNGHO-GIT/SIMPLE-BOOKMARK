# SIMPLE-BOOKMARK

## Overview

VS Code extension for bookmarking files and folders and operating on their original paths.

## Structure

- `src/commands/`: command handlers
- `src/providers/`: tree provider
- `src/services/`: sync and file operations
- `src/models/`: tree item model

## Notes

- Bookmark metadata is stored under `~/.bookmark/<workspace-path>`.
