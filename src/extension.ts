// extension.ts

import * as vscode from "vscode";
import { createBookmarkProvider } from "./providers/BookmarkProvider.js";
import { createBookmarkCommand } from "./commands/BookmarkCommand.js";
import type { BookmarkSystemItem } from "./models/BookmarkSystemItem.js";

// 추가 리스너 설정 ---------------------------------------------------------------------
const setupAdditionalListeners = (
	provider: ReturnType<typeof createBookmarkProvider>,
	commandManager: ReturnType<typeof createBookmarkCommand>,
	treeView: vscode.TreeView<BookmarkSystemItem>
): vscode.Disposable[] => {
	const listeners: vscode.Disposable[] = [];

	// 선택 변경 → 캐시 동기화
	const selListener = treeView.onDidChangeSelection(e => {
		console.debug("[SIMPLE-BOOKMARK.selectionChanged]", e.selection.length);
		commandManager.updateSelectedBookmark(e.selection as BookmarkSystemItem[]);
	});

	// 워크스페이스 폴더 변경 감지 → 북마크 갱신
	const workspaceListener = vscode.workspace.onDidChangeWorkspaceFolders(() => {
		console.debug("[SIMPLE-BOOKMARK.workspaceChanged]");
		vscode.window.showInformationMessage("Workspace changed. SIMPLE-BOOKMARK bookmarks may need to be refreshed.");
		provider.refresh();
	});

	// 확장 설정 변경 감지 → 북마크 갱신
	const configListener = vscode.workspace.onDidChangeConfiguration(e => {
		if (e.affectsConfiguration("SIMPLE-BOOKMARK")) {
			console.debug("[SIMPLE-BOOKMARK.configChanged]");
			provider.refresh();
		}
	});

	// 파일 저장 이벤트 감지 (로그)
	const saveListener = vscode.workspace.onDidSaveTextDocument((doc) => {
		console.debug("[SIMPLE-BOOKMARK.savebookmark]", doc.uri.fsPath);
	});

	listeners.push(selListener, workspaceListener, configListener, saveListener);
	return listeners;
};

// 활성화 훅 --------------------------------------------------------------------------------
export const activate = (
	context: vscode.ExtensionContext
): void => {
	console.debug("[SIMPLE-BOOKMARK.activate] start");
	const workspaceRoot = (
		vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0
		? vscode.workspace.workspaceFolders[0].uri.fsPath
		: undefined
	);

	if (!workspaceRoot) {
		vscode.window.showWarningMessage("SIMPLE-BOOKMARK requires an open workspace to function properly.");
		console.debug("[SIMPLE-BOOKMARK.activate] no workspace");
		return;
	}

	const provider = createBookmarkProvider(workspaceRoot);
	const commandManager = createBookmarkCommand(provider, context);
	const commands = commandManager.registerCommands();

	const treeView = vscode.window.createTreeView("SIMPLE-BOOKMARK", {
		treeDataProvider: provider,
		canSelectMany: true,
		showCollapseAll: true
	});

	const additionalListeners = setupAdditionalListeners(provider, commandManager, treeView);

	context.subscriptions.push(
		treeView,
		...commands,
		...additionalListeners,
		{ dispose: () => provider.dispose() }
	);
	console.debug("[SIMPLE-BOOKMARK.activate] ready");
};

// 비활성화 훅 ---------------------------------------------------------------------------------
export const deactivate = (): void => {
	console.debug("[SIMPLE-BOOKMARK.deactivate]");
};
