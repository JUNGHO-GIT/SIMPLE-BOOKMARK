// extension.ts

import * as vscode from "vscode";
import { DirectoryProvider } from "./provider/DirectoryProvider";
import { DirectoryWorker } from "./operator/DirectoryWorker";
import { DirectoryProviderCommands } from "./commands/CrudCommands";

// ------------------------------------------------------------------------------------------------------------
export const deactivate = () => {};
export const activate = (context: vscode.ExtensionContext) => {

	// 0. 디렉토리 작업자 및 제공자 생성 -----------------------------------------------------------------------
	const directoryOperator = DirectoryWorker(
		context,
		vscode.workspace.workspaceFolders
	);
	const directoryProvider = DirectoryProvider(directoryOperator);
	if (directoryOperator.setDirectoryProvider) {
		directoryOperator.setDirectoryProvider(directoryProvider);
	}

	// 1. 트리뷰 생성 및 선택된 항목 기억 ------------------------------------------------------------------------
	const treeView = vscode.window.createTreeView("JEXPLORER", {
		treeDataProvider: directoryProvider,
		showCollapseAll: true,
		canSelectMany: false
	});
	treeView.onDidChangeSelection(async (e) => {
		const selection = e.selection && e.selection[0];
		if (selection?.resourceUri) {
			directoryProvider.setLastSelectedUri(selection.resourceUri);
		}
	});
	context.subscriptions.push(treeView);
	vscode.window.registerTreeDataProvider("JEXPLORER", directoryProvider);

	// URI 파싱 유틸 (경로 형식 통일) ----------------------------------------------------------------------------
	const resolveTargetUri = async (args: any): Promise<vscode.Uri | undefined> => {
		let target: vscode.Uri | undefined;

		if (args?.resourceUri) {
			target = args.resourceUri;
		}
		else if (args?.path) {
			target = vscode.Uri.parse(args.path);
		}
		else if (args?.uri) {
			target = vscode.Uri.parse(args.uri);
		}
		else if (directoryProvider.getLastSelectedUri()) {
			target = directoryProvider.getLastSelectedUri();
		}
		else {
			// 클립보드에서 경로 가져오기
			await vscode.commands.executeCommand("copyFilePath");
			const clipboard = await vscode.env.clipboard.readText();
			if (clipboard) {
				target = vscode.Uri.file(clipboard);
			}
			else if (vscode.window.activeTextEditor) {
				target = vscode.window.activeTextEditor.document.uri;
			}
		}

		// 경로 형식 통일
		return target ? vscode.Uri.file(target.fsPath) : undefined;
	};

	// 1. 북마크 새로고침 ---------------------------------------------------------------------------------------
	context.subscriptions.push(vscode.commands.registerCommand(
		DirectoryProviderCommands.RefreshEntry,
		async () => {
			console.debug(`extension: [RefreshEntry]`);
			await directoryProvider.refresh();
		}
	));

	// 2. 북마크 아이템 선택 ------------------------------------------------------------------------------------
	context.subscriptions.push(vscode.commands.registerCommand(
		DirectoryProviderCommands.SelectItem,
		async (args) => {
			const targetUri = await resolveTargetUri(args);
			console.debug(`[SelectItem]`, JSON.stringify(targetUri?.fsPath, null, 2));

			if (targetUri) {
				await directoryProvider.selectItem(targetUri?.fsPath);
			}
			else {
				vscode.window.showErrorMessage("No file or folder selected.");
				return;
			}
		}
	));

	// 3. 북마크 추가 --------------------------------------------------------------------------------------------
	context.subscriptions.push(vscode.commands.registerCommand(
		DirectoryProviderCommands.AddItem,
		async (args) => {
			const targetUri = await resolveTargetUri(args);
			console.debug(`extension: [AddItem]`, JSON.stringify(targetUri?.fsPath, null, 2));

			if (targetUri) {
				await directoryProvider.addItem(targetUri?.fsPath);
			}
			else {
				vscode.window.showErrorMessage("No file or folder selected to add.");
				return;
			}
		}
	));

	// 4. 북마크 선택 제거 --------------------------------------------------------------------------------------
	context.subscriptions.push(vscode.commands.registerCommand(
		DirectoryProviderCommands.RemoveItem,
		async (args) => {
			const targetUri = await resolveTargetUri(args);
			console.debug(`extension: [RemoveItem]`, JSON.stringify(targetUri?.fsPath, null, 2));

			if (targetUri) {
				await directoryProvider.removeItem(targetUri?.fsPath);
			}
			else {
				vscode.window.showErrorMessage("No file or folder selected to remove.");
				return;
			}
		}
	));

	// 5. 북마크 전체 삭제 ----------------------------------------------------------------------------------------
	context.subscriptions.push(vscode.commands.registerCommand(
		DirectoryProviderCommands.RemoveAllItems,
		async () => {
			const bookmarkLength = directoryOperator.bookmarkedDirectories.length;
			console.debug(`extension: [RemoveAllItems]`, bookmarkLength);

			if (bookmarkLength > 0) {
				await directoryProvider.removeAllItems();
			}
			else {
				vscode.window.showErrorMessage("No bookmarks to remove.");
				return;
			}
		}
	));

	// 6. 북마크 아이템 제거 불가 ---------------------------------------------------------------------------------
	context.subscriptions.push(vscode.commands.registerCommand(
		DirectoryProviderCommands.CantRemoveItem,
		async () => {

			const bookmarkLength = directoryOperator.bookmarkedDirectories.length;
			console.debug(`extension: [CantRemoveItem]`, bookmarkLength);

			if (bookmarkLength > 0) {
				vscode.window.showErrorMessage("Cannot remove this item from bookmarks.");
			}
			else {
				vscode.window.showErrorMessage("No bookmarks to prevent removal.");
				return;
			}
		}
	));
};