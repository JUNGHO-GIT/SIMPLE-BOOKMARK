// extension.ts

import * as vscode from "vscode";
import { DirectoryProvider } from "./provider/DirectoryProvider";
import { DirectoryWorker } from "./operator/DirectoryWorker";
import { DirectoryProviderCommands } from "./commands/CrudCommands";
import { vsCodeCommands } from "./commands/CrudCommands";

// -----------------------------------------------------------------------------------------------------------------
export function activate(context: vscode.ExtensionContext) {
	const directoryOperator = new DirectoryWorker(
		context,
		vscode.workspace.workspaceFolders
	);
	const directoryProvider = new DirectoryProvider(
		directoryOperator
	);
	vscode.window.registerTreeDataProvider(
		"JEXPLORER",
		directoryProvider
	);

	// explorer에서 선택된 리소스 URI를 강제로 감지
	async function getExplorerSelectedResourceUri() {
		await vscode.commands.executeCommand('copyFilePath');
		const clipboard = await vscode.env.clipboard.readText();
		if (!clipboard) {
			return undefined;
		}
		return vscode.Uri.file(clipboard);
	}

	// 북마크 새로고침
	const refreshCommand = vscode.commands.registerCommand(
		DirectoryProviderCommands.RefreshEntry,
		() => directoryProvider.refresh()
	);

	// 북마크 파일/폴더 열기
	const openItemCommand = vscode.commands.registerCommand(
		DirectoryProviderCommands.OpenItem,
		(file) => {
			vscode.commands.executeCommand(
				vsCodeCommands.Open,
				vscode.Uri.parse(file.resourceUri.path)
			);
		}
	);

	// 북마크 추가 (컨텍스트 메뉴/단축키 등)
	const addItemCommand = vscode.commands.registerCommand(
		DirectoryProviderCommands.SelectItem,
		async (args) => {
			let targetUri: vscode.Uri | undefined = undefined;

			// 1. context menu/TreeItem에서 실행
			if (args && args.resourceUri) {
				targetUri = args.resourceUri;
			}
			else if (args && args.path) {
				targetUri = vscode.Uri.parse(args.path);
			}

			// 2. 단축키 등 직접 선택이 없을 때 clipboard fallback
			if (!targetUri) {
				targetUri = await getExplorerSelectedResourceUri();
			}

			// 3. 그래도 없으면 열린 에디터의 파일
			if (!targetUri && vscode.window.activeTextEditor) {
				targetUri = vscode.window.activeTextEditor.document.uri;
			}

			if (!targetUri) {
				vscode.window.showErrorMessage("No file or folder selected in explorer or editor.");
				return;
			}
			directoryProvider.selectItem(targetUri);
		}
	);

	// 북마크 삭제(컨텍스트/inline/단축키 모두)
	const removeItemCommand = vscode.commands.registerCommand(
		DirectoryProviderCommands.RemoveItem,
		async (args) => {
			let targetUri: vscode.Uri | undefined = undefined;

			// 1. context menu/TreeItem에서 실행
			if (args && args.resourceUri) {
				targetUri = args.resourceUri;
			}
			else if (args && args.path) {
				targetUri = vscode.Uri.parse(args.path);
			}

			// 2. 단축키 등 직접 선택이 없을 때 clipboard fallback
			if (!targetUri) {
				targetUri = await getExplorerSelectedResourceUri();
			}

			// 3. 그래도 없으면 열린 에디터의 파일
			if (!targetUri && vscode.window.activeTextEditor) {
				targetUri = vscode.window.activeTextEditor.document.uri;
			}

			if (!targetUri) {
				vscode.window.showErrorMessage("No file or folder selected to remove.");
				return;
			}
			directoryProvider.removeItem(targetUri);
		}
	);

	// 북마크 삭제 불가
	const cantRemoveItemCommand = vscode.commands.registerCommand(
		DirectoryProviderCommands.CantRemoveItem,
		() => {
			vscode.window.showInformationMessage(
				"You can only remove items that were directly added to the view"
			);
		}
	);

	// 북마크 전체 삭제
	const removeAllItemsCommand = vscode.commands.registerCommand(
		DirectoryProviderCommands.RemoveAllItems,
		() => directoryProvider.removeAllItems()
	);

	// 실제 파일로 이동 및 포커스
	const gotoItemCommand = vscode.commands.registerCommand(
		DirectoryProviderCommands.GotoItem,
		async (args) => {
			let targetUri: vscode.Uri | undefined = undefined;

			// 1. context menu/TreeItem에서 실행
			if (args && args.resourceUri) {
				targetUri = args.resourceUri;
			}
			else if (args && args.path) {
				targetUri = vscode.Uri.parse(args.path);
			}

			// 2. 단축키 등 직접 선택이 없을 때 clipboard fallback
			if (!targetUri) {
				targetUri = await getExplorerSelectedResourceUri();
			}

			// 3. 그래도 없으면 열린 에디터의 파일
			if (!targetUri && vscode.window.activeTextEditor) {
				targetUri = vscode.window.activeTextEditor.document.uri;
			}

			if (!targetUri) {
				vscode.window.showErrorMessage("No file or folder selected to go to.");
				return;
			}

			// 4. 에디터에서 파일 열기
			const document = await vscode.workspace.openTextDocument(targetUri);
			await vscode.window.showTextDocument(document, {
				preserveFocus: true,
				viewColumn: vscode.ViewColumn.One,
				preview: false
			});

			// 5. 실제 파일 탐색기에서 클릭한 것처럼 선택/포커스 이동
			await vscode.commands.executeCommand("revealInExplorer", targetUri);

			// 6. (선택) 커스텀 TreeView(JEXPLORER)에서도 선택 상태 동기화
			const treeView = vscode.window.createTreeView("JEXPLORER", {
				treeDataProvider: directoryProvider
			});
			const allItems = await directoryProvider.getChildren();
			const targetItem = allItems.find(item => item.resourceUri?.toString() === targetUri.toString());
			if (targetItem) {
				treeView.reveal(targetItem, { select: true, focus: true });
			}
		}
	);


	// 이벤트 리스너 등록
	directoryProvider.onDidChangeTreeData(() => {
		directoryProvider.refresh();
	});

	// 명령어 등록
	context.subscriptions.push(
		refreshCommand,
		openItemCommand,
		addItemCommand,
		removeItemCommand,
		cantRemoveItemCommand,
		removeAllItemsCommand,
		gotoItemCommand
	);
}

export function deactivate() {}
