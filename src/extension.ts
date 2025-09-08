// extension.ts

import * as vscode from "vscode";
import {BookmarkProvider} from "./providers/BookmarkProvider.js";
import {BookmarkCommand} from "./commands/BookmarkCommand.js";
import {BookmarkSystemItem} from "./models/BookmarkSystemItem.js";

// -------------------------------------------------------------------------------------------------------------
function setupAdditionalListeners (
	provider: BookmarkProvider,
	commandManager: BookmarkCommand,
	treeView: vscode.TreeView<BookmarkSystemItem>
): vscode.Disposable[] {
	const listeners: vscode.Disposable[] = [];

	// 선택 변경 → 캐시 동기화
	const selListener = treeView.onDidChangeSelection(e => {
		commandManager.updateSelectedItems(e.selection as BookmarkSystemItem[]);
	});

	// 워크스페이스 폴더 변경 감지 → 북마크 갱신
	const workspaceListener = vscode.workspace.onDidChangeWorkspaceFolders(() => {
		vscode.window.showInformationMessage('Workspace changed. JEXPLORER bookmarks may need to be refreshed.');
		provider.refresh();
	});

	// 확장 설정 변경 감지 → 북마크 갱신
	const configListener = vscode.workspace.onDidChangeConfiguration(e => {
		if (e.affectsConfiguration('JEXPLORER')) {
			provider.refresh();
		}
	});

	// 파일 저장 이벤트 감지 (로그)
	const saveListener = vscode.workspace.onDidSaveTextDocument(() => {
		console.debug(`[JEXPLORER.saveitem]`, JSON.stringify(saveListener, null, 2));
	});

	listeners.push(selListener, workspaceListener, configListener, saveListener);
	return listeners;
}

// -------------------------------------------------------------------------------------------------------------
export const activate = (
	context: vscode.ExtensionContext
): void => {

	const workspaceRoot = (
		vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0
		? vscode.workspace.workspaceFolders[0].uri.fsPath
		: undefined
	);

	if (!workspaceRoot) {
		vscode.window.showWarningMessage('JEXPLORER requires an open workspace to function properly.');
		return;
	}

	const provider = new BookmarkProvider(workspaceRoot);
	const commandManager = new BookmarkCommand(provider, context);
	const commands = commandManager.registerCommands();
	const treeView = vscode.window.createTreeView('JEXPLORER', {
		treeDataProvider: provider,
		canSelectMany: true,
		showCollapseAll: true
	});

	const additionalListeners = setupAdditionalListeners(provider, commandManager, treeView);

	context.subscriptions.push(
		treeView,
		...commands,
		...additionalListeners,
		{dispose: () => provider.dispose()}
	);
}

// -------------------------------------------------------------------------------------------------------------
export const deactivate = (): void => {}
