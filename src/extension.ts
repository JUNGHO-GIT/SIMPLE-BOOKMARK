// extension.ts

import * as vscode from "vscode";
import { DirectoryProvider } from "./provider/DirectoryProvider";
import { DirectoryWorker } from "./operator/DirectoryWorker";
import { DirectoryProviderCommands } from "./commands/CrudCommands";

// -----------------------------------------------------------------------------------------------------------------
export function activate(context: vscode.ExtensionContext) {

	// 0. 디렉토리 작업자 및 제공자 생성 -----------------------------------------------------------------------
	const directoryOperator = new DirectoryWorker(
		context,
		vscode.workspace.workspaceFolders
	);
	const directoryProvider = new DirectoryProvider(directoryOperator);

	// 1. 트리뷰 생성 및 선택된 항목 기억 ------------------------------------------------------------------------
	const treeView = vscode.window.createTreeView("JEXPLORER", {
		treeDataProvider: directoryProvider,
		showCollapseAll: true,
		canSelectMany: false
	});
	treeView.onDidChangeSelection(async (e) => {
		const selection = e.selection && e.selection[0];
		if (selection && selection.resourceUri) {
			directoryProvider.setLastSelectedUri(selection.resourceUri);
		}
	});
	context.subscriptions.push(treeView);
	vscode.window.registerTreeDataProvider("JEXPLORER", directoryProvider);

	// URI 파싱 유틸 ---------------------------------------------------
	const resolveTargetUri = async (args: any): Promise<vscode.Uri | undefined> => {
		if (args?.resourceUri) {
			return args.resourceUri;
		}
		if (args?.path) {
			return vscode.Uri.parse(args.path);
		}
		if (args?.uri) {
			return vscode.Uri.parse(args.uri);
		}
		// 트리뷰에서 마지막 선택된 uri 우선 사용
		if (directoryProvider.getLastSelectedUri()) {
			return directoryProvider.getLastSelectedUri();
		}
		await vscode.commands.executeCommand('copyFilePath');
		const clipboard = await vscode.env.clipboard.readText();

		if (clipboard) {
			return vscode.Uri.file(clipboard);
		}
		if (vscode.window.activeTextEditor) {
			return vscode.window.activeTextEditor.document.uri;
		}
		return undefined;
	};

	// 1. 북마크 새로고침 ------------------------------------------------
	context.subscriptions.push(vscode.commands.registerCommand(
		DirectoryProviderCommands.RefreshEntry,
		async () => directoryProvider.refresh()
	));

	// 2. 북마크 아이템 선택 -----------------------------------------
	context.subscriptions.push(vscode.commands.registerCommand(
		DirectoryProviderCommands.SelectItem,
		async (args) => {
			const targetUri = await resolveTargetUri(args);
			console.log(`[SelectItem]`, targetUri?.path);
			if (!targetUri) {
				vscode.window.showErrorMessage("No file or folder selected.");
				return;
			}
			await directoryProvider.selectItem(targetUri);
		}
	));

	// 3. 북마크 추가 -----------------------------------------------------
	context.subscriptions.push(vscode.commands.registerCommand(
		DirectoryProviderCommands.AddItem,
		async (args) => {
			const targetUri = await resolveTargetUri(args);
			console.log(`[AddItem]`, targetUri?.path);
			if (!targetUri) {
				vscode.window.showErrorMessage("No file or folder selected to add.");
				return;
			}
			await directoryProvider.addItem(targetUri);
		}
	));

	// 4. 북마크 아이템 제거 ----------------------------------------------
	context.subscriptions.push(vscode.commands.registerCommand(
		DirectoryProviderCommands.RemoveItem,
		async (args) => {
			const targetUri = await resolveTargetUri(args);
			console.log(`[RemoveItem]`, targetUri?.path);
			if (!targetUri) {
				vscode.window.showErrorMessage("No file or folder selected to remove.");
				return;
			}
			await directoryProvider.removeItem(targetUri);
		}
	));

	// 5. 북마크 전체 삭제 -------------------------------------------------
	context.subscriptions.push(vscode.commands.registerCommand(
		DirectoryProviderCommands.RemoveAllItems,
		async () => {
			console.log(`[RemoveAllItems]`);
			await directoryProvider.removeAllItems();
		}
	));

	// 6. 북마크 아이템 제거 불가 ------------------------------------------
	context.subscriptions.push(vscode.commands.registerCommand(
		DirectoryProviderCommands.CantRemoveItem,
		async () => {
			await vscode.window.showErrorMessage(
				"Cannot remove this item. It is either a system file or not supported."
			);
		}
	));
}

// -----------------------------------------------------------------------------------------------------------------
export function deactivate() {}
