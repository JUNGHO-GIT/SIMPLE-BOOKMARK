# SIMPLE-BOOKMARK Architecture

## Purpose

Provide a TreeView-based bookmark layer for files and folders in VS Code.

## Structure

- `extension.ts`: activation entry
- `commands/`: user commands
- `providers/`: tree composition
- `services/`: bookmark sync and file operations
- `models/`: bookmark tree items

## Flow

1. `extension.ts` wires commands and provider.
2. `BookmarkProvider` loads bookmark metadata from `~/.bookmark`.
3. Commands delegate rename, remove, copy, paste, and sync work to services.
