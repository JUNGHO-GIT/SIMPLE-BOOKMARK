// extension.ts

import * as vscode from "vscode";
import { DirectoryProvider } from "./service/DirectoryProvider";
import { DirectoryWorker } from "./service/DirectoryWorker";
import { DirectoryProviderCommands } from "./commands/CrudCommands";

// ------------------------------------------------------------------------------------------------------------
export function deactivate() {}
export function activate(context: vscode.ExtensionContext) {

	// 0. 디렉토리 작업자 및 제공자 생성 -----------------------------------------------------------------------
	const directoryOperator = DirectoryWorker(
		context,
		vscode.workspace.workspaceFolders
	);
	const directoryProvider = DirectoryProvider(
		directoryOperator
	);

	// 1. 트리뷰 생성 및 선택된 항목 기억 ------------------------------------------------------------------------
	const treeView = vscode.window.createTreeView("JEXPLORER", {
		treeDataProvider: directoryProvider,
		showCollapseAll: true,
		canSelectMany: false
	});
	treeView.onDidChangeVisibility(function (e) {
		vscode.commands.executeCommand("setContext", "jexplorer:active", e.visible === true);
	});
	treeView.onDidChangeSelection(async function (e) {
		const selection = e.selection && e.selection[0];
		if (selection) {
			if (selection.resourceUri) {
				directoryProvider.setLastSelectedUri(selection.resourceUri);
				console.debug(`Selection changed: ${selection.resourceUri.fsPath}`);
			} else if (selection.tooltip) {
				const uri = vscode.Uri.file(selection.tooltip.toString());
				directoryProvider.setLastSelectedUri(uri);
				console.debug(`Selection changed (from tooltip): ${uri.fsPath}`);
			}
		}
	});
	context.subscriptions.push(treeView);
	vscode.window.registerTreeDataProvider("JEXPLORER", directoryProvider);

	// 2. 파일 시스템 감시자 설정 (실제 탐색기와 동기화) --------------------------------------------------------
	const fileWatcher = vscode.workspace.createFileSystemWatcher("**/*");
	fileWatcher.onDidCreate(async function () {
		await directoryProvider.refresh();
	});
	fileWatcher.onDidDelete(async function () {
		await directoryOperator.validateBookmarks();
		await directoryProvider.refresh();
	});
	fileWatcher.onDidChange(async function () {
		await directoryProvider.refresh();
	});
	context.subscriptions.push(fileWatcher);

	// URI 파싱 유틸 ------------------------------------------------------------------------------------
	async function resolveTargetUri(args: any): Promise<vscode.Uri | undefined> {
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
		// 클립보드에서 경로 가져오기
		else {
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

	// 2. 북마크 아이템 선택 ------------------------------------------------------------------------------------
	context.subscriptions.push(vscode.commands.registerCommand(
		DirectoryProviderCommands.SelectItem,
		async function (args) {

			const selectedPath = await resolveTargetUri(args);
			console.debug(`[SelectItem]`, JSON.stringify(selectedPath?.fsPath, null, 2));

			if (selectedPath) {
				await directoryProvider.selectItem(selectedPath?.fsPath);
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
		async function (args) {

			const pathToAdd = await resolveTargetUri(args);
			console.debug(`[AddItem]`, JSON.stringify(pathToAdd?.fsPath, null, 2));

			if (pathToAdd) {
				await directoryProvider.addItem(pathToAdd?.fsPath);
			}
			else {
				vscode.window.showErrorMessage("No file or folder selected to add.");
				return;
			}
		}
	));

	// 4. 북마크 복사 ------------------------------------------------------------------------------------------------
	context.subscriptions.push(vscode.commands.registerCommand(
		DirectoryProviderCommands.CopyItem,
		async function (args) {

			const copiedPath = await resolveTargetUri(args);
			console.debug(`[CopyItem]`, JSON.stringify(copiedPath?.fsPath, null, 2));

			if (copiedPath) {
				await directoryProvider.copyItem(copiedPath?.fsPath);
			}
			else {
				vscode.window.showErrorMessage("No file or folder selected to copy.");
				return;
			}
		}
	));

	// 5. 북마크 붙여넣기 ----------------------------------------------------------------------------------------
	context.subscriptions.push(vscode.commands.registerCommand(
		DirectoryProviderCommands.PasteItem,
		async function (args) {

			// 복사한 파일 or 폴더 경로
			const pastedPath = await resolveTargetUri(args);

			// 대상 경로
			const targetPath = await vscode.window.showInputBox({
				prompt: "Enter the target path to paste the item",
				value: directoryProvider.getLastSelectedUri()?.fsPath || "",
				placeHolder: "e.g., /path/to/target/directory"
			});

			console.debug(`[PasteItem]`, JSON.stringify(pastedPath?.fsPath, null, 2), targetPath);

			if (pastedPath && targetPath) {
				await directoryProvider.pasteItem(pastedPath.fsPath, targetPath);
			}
			else {
				vscode.window.showErrorMessage("No item to paste or target location not specified.");
				return;
			}
		}
	));

	// 6. 북마크 삭제 --------------------------------------------------------------------------------------
	context.subscriptions.push(vscode.commands.registerCommand(
		DirectoryProviderCommands.RemoveItem,
		async function (args) {
			const pathToDelete = await resolveTargetUri(args);
			console.debug(`[RemoveItem]`, JSON.stringify(pathToDelete?.fsPath, null, 2));

			if (pathToDelete) {
				await directoryProvider.removeItem(pathToDelete?.fsPath);
			}
			else {
				vscode.window.showErrorMessage("No file or folder selected to remove.");
				return;
			}
		}
	));

	// 7. 북마크 전체 삭제 -------------------------------------------------------------------------------------
	context.subscriptions.push(vscode.commands.registerCommand(
		DirectoryProviderCommands.RemoveAllItems,
		async function () {
			const bookmarkLength = directoryOperator.bookmarkedDirectories.length;
			console.debug(`[RemoveAllItems]`, bookmarkLength);

			if (bookmarkLength > 0) {
				await directoryProvider.removeAllItems();
			}
			else {
				vscode.window.showErrorMessage("No bookmarks to remove.");
				return;
			}
		}
	));

	// 8. 북마크 아이템 제거 불가 ---------------------------------------------------------------------------------
	context.subscriptions.push(vscode.commands.registerCommand(
		DirectoryProviderCommands.CantRemoveItem,
		async function () {
			const bookmarkLength = directoryOperator.bookmarkedDirectories.length;
			console.debug(`[CantRemoveItem]`, bookmarkLength);

			if (bookmarkLength > 0) {
				vscode.window.showErrorMessage("Cannot remove this item from bookmarks.");
			}
			else {
				vscode.window.showErrorMessage("No bookmarks to prevent removal.");
				return;
			}
		}
	));

	// 1. 북마크 새로고침 ---------------------------------------------------------------------------------------
	context.subscriptions.push(vscode.commands.registerCommand(
		DirectoryProviderCommands.RefreshEntry,
		async function () {
			console.debug(`[RefreshEntry]`);
			await directoryOperator.validateBookmarks();
			await directoryProvider.refresh();
		}
	));
}
