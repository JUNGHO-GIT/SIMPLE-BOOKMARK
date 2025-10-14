// extension.ts

import * as vscode from "vscode";
import { showInfoAuto, showWarnAuto } from "./utils/NotificationUtil.js";
import { createBookmarkProvider } from "./providers/BookmarkProvider.js";
import { createBookmarkCommand } from "./commands/BookmarkCommand.js";
import type { BookmarkSystemItem } from "./models/BookmarkSystemItem.js";

// -----------------------------------------------------------------------------------------
const fnSetupAdditionalListeners = (
	provider: ReturnType<typeof createBookmarkProvider>,
	commandManager: ReturnType<typeof createBookmarkCommand>,
	treeView: vscode.TreeView<BookmarkSystemItem>
): vscode.Disposable[] => {
	const listeners: vscode.Disposable[] = [];
	let selectionTimer: NodeJS.Timeout | null = null;
	let workspaceTimer: NodeJS.Timeout | null = null;
	let configTimer: NodeJS.Timeout | null = null;

	const selListener = treeView.onDidChangeSelection(e => {
		selectionTimer && clearTimeout(selectionTimer);
		selectionTimer = setTimeout(() => {
			console.debug("[Simple-Bookmark.selectionChanged]", e.selection.length);
			commandManager.updateSelectedBookmark(e.selection as BookmarkSystemItem[]);
			selectionTimer = null;
		}, 50);
	});

	const workspaceListener = vscode.workspace.onDidChangeWorkspaceFolders(() => {
		workspaceTimer && clearTimeout(workspaceTimer);
		workspaceTimer = setTimeout(() => {
			console.debug("[Simple-Bookmark.workspaceChanged]");
			showInfoAuto("Workspace changed. Simple-Bookmark bookmarks may need to be refreshed.");
			provider.refresh();
			workspaceTimer = null;
		}, 200);
	});

	const configListener = vscode.workspace.onDidChangeConfiguration(e => {
		(e.affectsConfiguration("Simple-Bookmark") || e.affectsConfiguration("files.exclude")) && (() => {
			configTimer && clearTimeout(configTimer);
			configTimer = setTimeout(() => {
				console.debug("[Simple-Bookmark.configChanged]");
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

// -----------------------------------------------------------------------------------------
export const activate = (context: vscode.ExtensionContext): void => {
	console.debug("[Simple-Bookmark.activate] start");
	const workspaceRoot = (
		vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0
		? vscode.workspace.workspaceFolders[0].uri.fsPath
		: undefined
	);

	!workspaceRoot && (
		showWarnAuto("[Simple-Bookmark] requires an open workspace to function properly."),
		console.debug("[Simple-Bookmark.activate] no workspace")
	);

	const provider = createBookmarkProvider(workspaceRoot);
	const commandManager = createBookmarkCommand(provider, context);
	const commands = commandManager.registerCommands();
	const treeView = vscode.window.createTreeView("Simple-Bookmark", {
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

	const additionalListeners = fnSetupAdditionalListeners(provider, commandManager, treeView);

	context.subscriptions.push(
		treeView,
		...commands,
		...additionalListeners,
		{ dispose: () => provider.dispose() }
	);
};

// -----------------------------------------------------------------------------------------
export const deactivate = (): void => {
	console.debug("[Simple-Bookmark.deactivate]");
};
