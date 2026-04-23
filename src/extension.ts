// extension.ts

import { vscode } from "@exportLibs";
import { notify, logger, initLogger } from "@exportScripts";
import { BookmarkProvider } from "@exportProviders";
import { BookmarkCommand } from "@exportCommands";
import type { BookmarkProviderType, BookmarkCommandType, BookmarkModelType } from "@exportTypes";

// ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
// 1. 확장 진입점
// ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――

// 1-1. deactivate
export const deactivate = () => {};

// 1-2. activate
export const activate = (context: vscode.ExtensionContext) => {

	// 0. Initialize Logger ------------------------------------------------------------------------
	initLogger();
	logger(`info`, `Simple-Bookmark is now active!`);
	const workspaceRoot = (
		vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0
			? vscode.workspace.workspaceFolders[0].uri.fsPath
			: undefined
	);

	!workspaceRoot && (() => {
		notify(`warn`, `activate - requires an open workspace to function properly.`);
		logger(`debug`, `activate - no workspace`);
	})();

	const provider = BookmarkProvider(workspaceRoot);
	const commandManager = BookmarkCommand(provider, context);
	const commands = commandManager.registerCommands();
	const treeView = vscode.window.createTreeView(`Simple-Bookmark`, {
		treeDataProvider: provider,
		canSelectMany: true,
		showCollapseAll: true,
	});

	treeView.onDidExpandElement(e => {
		const p = e.element.originalPath;
		p && provider.markExpanded(p);
	});
	treeView.onDidCollapseElement(e => {
		const p = e.element.originalPath;
		p && provider.markCollapsed(p);
	});

	const additionalListeners = setupAdditionalListeners(provider, commandManager, treeView);

	context.subscriptions.push(
		treeView,
		...commands,
		...additionalListeners,
		{ dispose: () => { provider.dispose(); } }
	);
};

// 1-3. 추가 리스너 설정
const setupAdditionalListeners = (
	provider: BookmarkProviderType,
	commandManager: BookmarkCommandType,
	treeView: vscode.TreeView<BookmarkModelType>
): vscode.Disposable[] => {
	const listeners: vscode.Disposable[] = [];
	let selectionTimer: NodeJS.Timeout | null = null;
	let workspaceTimer: NodeJS.Timeout | null = null;
	let configTimer: NodeJS.Timeout | null = null;

	const selListener = treeView.onDidChangeSelection((e) => {
		selectionTimer && clearTimeout(selectionTimer);
		selectionTimer = setTimeout(() => {
			logger(`debug`, `select - ${e.selection.map(item => item.label).join(`, `)}`);
			commandManager.updateSelectedBookmark(e.selection as BookmarkModelType[]);
			selectionTimer = null;
		}, 50);
	});

	const workspaceListener = vscode.workspace.onDidChangeWorkspaceFolders(() => {
		workspaceTimer && clearTimeout(workspaceTimer);
		workspaceTimer = setTimeout(() => {
			logger(`debug`, `activate - workspace changed`);
			notify(`info`, `activate - Bookmarks may need to be refreshed.`);
			provider.refresh();
			workspaceTimer = null;
		}, 200);
	});

	const configListener = vscode.workspace.onDidChangeConfiguration(e => {
		(e.affectsConfiguration(`Simple-Bookmark`) || e.affectsConfiguration(`files.exclude`)) && (() => {
			configTimer && clearTimeout(configTimer);
			configTimer = setTimeout(() => {
				logger(`debug`, `activate - configuration changed`);
				provider.refresh();
				configTimer = null;
			}, 150);
		})();
	});

	const timerCleanup: vscode.Disposable = {
		dispose: () => {
			selectionTimer && clearTimeout(selectionTimer);
			workspaceTimer && clearTimeout(workspaceTimer);
			configTimer && clearTimeout(configTimer);
			selectionTimer = workspaceTimer = configTimer = null;
		},
	};

	listeners.push(selListener, workspaceListener, configListener, timerCleanup);
	return listeners;
};
