// extension.ts

import { vscode } from "@exportLibs";
import { notify, logging } from "@exportScripts";
import { BookmarkProvider } from "@exportProviders";
import { BookmarkCommand } from "@exportCommands";
import type { BookmarkProviderType, BookmarkCommandType, BookmarkModelType } from "@exportTypes";

// 1. activate ---------------------------------------------------------------------------------
export const activate = (
	context: vscode.ExtensionContext
): void => {
	logging(`debug`, `activate`, ``);
	const workspaceRoot = (
		vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0
		? vscode.workspace.workspaceFolders[0].uri.fsPath
		: undefined
	);

	!workspaceRoot && (
		notify(`warn`, `activate`, `requires an open workspace to function properly.`),
		logging(`debug`, `activate`, `no workspace`)
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
	logging(`debug`, `deactivate`, ``);
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
			logging(`debug`, `select`, `${e.selection.length}`);
			commandManager.updateSelectedBookmark(e.selection as BookmarkModelType[]);
			selectionTimer = null;
		}, 50);
	});

	const workspaceListener = vscode.workspace.onDidChangeWorkspaceFolders(() => {
		workspaceTimer && clearTimeout(workspaceTimer);
		workspaceTimer = setTimeout(() => {
			logging(`debug`, `activate`, `workspace changed`);
			notify(`info`, `activate`, `Bookmarks may need to be refreshed.`);
			provider.refresh();
			workspaceTimer = null;
		}, 200);
	});

	const configListener = vscode.workspace.onDidChangeConfiguration(e => {
		(e.affectsConfiguration("simple-bookmark") || e.affectsConfiguration("files.exclude")) && (() => {
			configTimer && clearTimeout(configTimer);
				configTimer = setTimeout(() => {
					logging(`debug`, `activate`, `configuration changed`);
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