# Architecture

## 1. Overview

`SIMPLE-BOOKMARK` is a VS Code extension designed to manage file and folder bookmarks within a workspace. It maintains a dedicated bookmark structure and synchronizes it with the actual workspace files, providing a TreeView interface for easy navigation.

## 2. Project Structure

The project follows a modular architecture separating concerns into Commands, Models, Providers, and Services.

```text
src/
├── extension.ts                    # Entry Point (VSCode Extension Activation)
├── commands/                       # Command handlers (User actions)
├── models/                         # Data models (TreeItem representation)
├── providers/                      # UI Providers (TreeDataProvider)
├── services/                       # Business logic (File operations, Sync)
├── assets/
│   ├── scripts/                    # Core Utilities
│   │   ├── diagnostic.ts           # Diagnostic Manager (validation orchestration)
│   │   ├── filter.ts               # Document Filtering (analyzable check)
│   │   ├── glob.ts                 # Glob Pattern Utilities
│   │   ├── lineIndex.ts            # Line/Column Index Mapper
│   │   ├── logger.ts               # Logging System
│   │   ├── notify.ts               # User Notifications
│   │   ├── performance.ts          # Performance Monitoring & Resource Limiting
│   │   └── validate.ts             # Document Validation Logic
│   └── types/
└── exports/                        # Barrel files for clean imports
```

## 3. Key Components

### 3.1. Entry Point (`extension.ts`)

- **Role**: Bootstraps the extension.
- **Responsibilities**:
  - Initializes `Logger`, `BookmarkProvider`, and `BookmarkCommand`.
  - Registers the `Simple-Bookmark` TreeView.
  - Sets up event listeners (Selection, Workspace changes, Configuration).

### 3.2. Provider Layer (`providers/BookmarkProvider.ts`)

- **Role**: Implements `vscode.TreeDataProvider`.
- **Responsibilities**:
  - Supplies data to the VS Code TreeView.
  - Manages the lifecycle of the bookmark storage folder.
  - Orchestrates `BookmarkOperationService` and `BookmarkSyncService`.
  - Handles tree expansion/collapse states and refreshes.

### 3.3. Command Layer (`commands/BookmarkCommand.ts`)

- **Role**: Handles user interactions and commands.
- **Responsibilities**:
  - Registers and executes VS Code commands.
  - Manages bookmark selection state.
  - Applies `files.exclude` rules using `LRUCache` and `Minimatch`.

### 3.4. Service Layer (`services/`)

- **`BookmarkOperationService.ts`**:
  - Handles low-level file system operations.
  - Provides utilities for path normalization and file flattening.
- **`BookmarkSyncService.ts`**:
  - Manages synchronization logic between the bookmark metadata and actual workspace files.

### 3.5. Data Model (`models/BookmarkModel.ts`)

- **Role**: Represents a node in the TreeView.
- **Responsibilities**:
  - Extends `vscode.TreeItem`.
  - Visualizes bookmark status (`SYNCED`, `MISSING`, `MODIFIED`) via icons and colors.
  - Encapsulates metadata (`BookmarkMetadata`).

## 4. Data Flow

1. **Initialization**: `extension.ts` initializes the Provider and Services.
2. **User Action**: User clicks a bookmark or runs a command -> `BookmarkCommand` intercepts.
3. **Processing**: Command delegates to `BookmarkProvider` or Services.
4. **State Update**: `BookmarkProvider` refreshes the tree data based on file system state or service results.
5. **Visualization**: `BookmarkModel` renders the updated state in the TreeView.

## 5. Design Patterns & Principles

- **Functional Composition**: Components are primarily defined as factory functions (e.g., `BookmarkModel`, `BookmarkCommand`) rather than pure classes, promoting closure-based encapsulation.
- **Provider Pattern**: Standard VS Code TreeDataProvider implementation.
- **Service Oriented**: Business logic is isolated in services, keeping UI logic (Provider) clean.
- **Performance**: Uses `LRUCache` for expensive operations like exclude pattern matching.
