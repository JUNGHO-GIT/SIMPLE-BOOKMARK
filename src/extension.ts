// extension.ts

import * as vscode from "vscode";
import { showInfoAuto, showWarnAuto } from "./utils/NotificationUtil.js";
import { createBookmarkProvider } from "./providers/BookmarkProvider.js";
import { createBookmarkCommand } from "./commands/BookmarkCommand.js";
import type { BookmarkSystemItem } from "./models/BookmarkSystemItem.js";

// 추가 리스너 설정 최적화 - 디바운싱 및 불필요한 이벤트 최소화 -------------------------
const setupAdditionalListeners = (
	provider: ReturnType<typeof createBookmarkProvider>,
	commandManager: ReturnType<typeof createBookmarkCommand>,
	treeView: vscode.TreeView<BookmarkSystemItem>
): vscode.Disposable[] => {
	const listeners: vscode.Disposable[] = [];

	// 선택 변경 → 캐시 동기화 (디바운싱)
	let selectionTimer: NodeJS.Timeout | null = null;
	const selListener = treeView.onDidChangeSelection(e => {
		selectionTimer && clearTimeout(selectionTimer);
		selectionTimer = setTimeout(() => {
			console.debug("[Simple-Bookmark.selectionChanged]", e.selection.length);
			commandManager.updateSelectedBookmark(e.selection as BookmarkSystemItem[]);
		}, 50);
	});

	// 워크스페이스 폴더 변경 감지 → 북마크 갱신 (디바운싱)
	let workspaceTimer: NodeJS.Timeout | null = null;
	const workspaceListener = vscode.workspace.onDidChangeWorkspaceFolders(() => {
		workspaceTimer && clearTimeout(workspaceTimer);
		workspaceTimer = setTimeout(() => {
			console.debug("[Simple-Bookmark.workspaceChanged]");
			showInfoAuto("Workspace changed. Simple-Bookmark bookmarks may need to be refreshed.");
			provider.refresh();
		}, 200);
	});

	// 확장 설정 변경 감지 → 북마크 갱신 (더 정확한 필터링)
	let configTimer: NodeJS.Timeout | null = null;
	const configListener = vscode.workspace.onDidChangeConfiguration(e => {
		if (e.affectsConfiguration("Simple-Bookmark") || e.affectsConfiguration("files.exclude")) {
			configTimer && clearTimeout(configTimer);
			configTimer = setTimeout(() => {
				console.debug("[Simple-Bookmark.configChanged]");
				provider.refresh();
			}, 150);
		}
	});

	listeners.push(selListener, workspaceListener, configListener);
	return listeners;
};

// 활성화 훅 --------------------------------------------------------------------------------
export const activate = (
	context: vscode.ExtensionContext
): void => {
	console.debug("[Simple-Bookmark.activate] start");
	const workspaceRoot = (
		vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0
		? vscode.workspace.workspaceFolders[0].uri.fsPath
		: undefined
	);

	!workspaceRoot && showWarnAuto("[Simple-Bookmark] requires an open workspace to function properly.");
	console.debug("[Simple-Bookmark.activate] no workspace");

	const provider = createBookmarkProvider(workspaceRoot);
	const commandManager = createBookmarkCommand(provider, context);
	const commands = commandManager.registerCommands();
	const treeView = vscode.window.createTreeView("Simple-Bookmark", {
		treeDataProvider: provider,
		canSelectMany: true,
		showCollapseAll: true
	});

	// 확장/축소 상태 추적
	treeView.onDidExpandElement(e => {
		const p = (e.element as any).originalPath;
		p && (provider as any).markExpanded(process.platform === "win32" ? p.toLowerCase() : p);
	});
	treeView.onDidCollapseElement(e => {
		const p = (e.element as any).originalPath;
		p && (provider as any).markCollapsed(process.platform === "win32" ? p.toLowerCase() : p);
	});

	const additionalListeners = setupAdditionalListeners(provider, commandManager, treeView);

	context.subscriptions.push(
		treeView,
		...commands,
		...additionalListeners,
		{ dispose: () => provider.dispose() }
	);
};

// 비활성화 훅 ---------------------------------------------------------------------------------
export const deactivate = (
): void => {
	console.debug("[Simple-Bookmark.deactivate]");
};
