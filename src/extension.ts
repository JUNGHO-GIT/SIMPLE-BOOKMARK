// extension.ts

import { vscode } from "@importLibs";
import { fnNotification, fnLogging } from "@importScripts";
import { BookmarkProvider } from "@importProviders";
import { BookmarkCommand } from "@importCommands";
import type { BookmarkProviderType, BookmarkCommandType, BookmarkModelType } from "@importTypes";

// 1. activate ---------------------------------------------------------------------------------
export const activate = (
	context: vscode.ExtensionContext
): void => {
	fnLogging(`activate`, ``, `debug`);
	const workspaceRoot = (
		vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0
		? vscode.workspace.workspaceFolders[0].uri.fsPath
		: undefined
	);

	!workspaceRoot && (
		fnNotification(`activate`, `requires an open workspace to function properly.`, `warn`),
		fnLogging(`activate`, `no workspace`, `debug`)
	);

	const provider = BookmarkProvider(workspaceRoot);
	const commandManager = BookmarkCommand(provider, context);
	const commands = commandManager.registerCommands();
	const treeView = vscode.window.createTreeView("simple-bookmark", {
		treeDataProvider: provider,
		canSelectMany: true,
		showCollapseAll: true
	});

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

// 2. deactivate ---------------------------------------------------------------------------------
export const deactivate = (
): void => {
	fnLogging(`deactivate`, ``, `debug`);
};

// 3. setup ---------------------------------------------------------------------------------------
const setupAdditionalListeners = (
	provider: BookmarkProviderType,
	commandManager: BookmarkCommandType,
	treeView: vscode.TreeView<BookmarkModelType>
): vscode.Disposable[] => {
	const listeners: vscode.Disposable[] = [];
	let selectionTimer: NodeJS.Timeout | null = null;
	let workspaceTimer: NodeJS.Timeout | null = null;
	let configTimer: NodeJS.Timeout | null = null;

	const selListener = treeView.onDidChangeSelection(e => {
		selectionTimer && clearTimeout(selectionTimer);
		selectionTimer = setTimeout(() => {
			fnLogging(`select`, `${e.selection.length}`, `debug`);
			commandManager.updateSelectedBookmark(e.selection as BookmarkModelType[]);
			selectionTimer = null;
		}, 50);
	});

	const workspaceListener = vscode.workspace.onDidChangeWorkspaceFolders(() => {
		workspaceTimer && clearTimeout(workspaceTimer);
		workspaceTimer = setTimeout(() => {
			fnLogging(`activate`, `workspace changed`, `debug`);
			fnNotification(`activate`, `Bookmarks may need to be refreshed.`, `info`);
			provider.refresh();
			workspaceTimer = null;
		}, 200);
	});

	const configListener = vscode.workspace.onDidChangeConfiguration(e => {
		(e.affectsConfiguration("simple-bookmark") || e.affectsConfiguration("files.exclude")) && (() => {
			configTimer && clearTimeout(configTimer);
				configTimer = setTimeout(() => {
					fnLogging(`activate`, `configuration changed`, `debug`);
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
		}
	};

	listeners.push(selListener, workspaceListener, configListener, timerCleanup);
	return listeners;
};