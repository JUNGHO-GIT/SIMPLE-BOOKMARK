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

	context.subscriptions.push(
		...[
			// 북마크 새로고침
			vscode.commands.registerCommand(
				DirectoryProviderCommands.RefreshEntry,
				() => directoryProvider.refresh()
			),

			// 북마크 파일/폴더 열기
			vscode.commands.registerCommand(
				DirectoryProviderCommands.OpenItem,
				(file) => {
					vscode.commands.executeCommand(
						vsCodeCommands.Open,
						vscode.Uri.parse(file.resourceUri.path)
					);
				}
			),

			// 북마크 추가 (컨텍스트 메뉴/단축키 등)
			vscode.commands.registerCommand(
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
			),

			// 북마크 삭제(컨텍스트/inline/단축키 모두)
			vscode.commands.registerCommand(
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
			),

			vscode.commands.registerCommand(
				DirectoryProviderCommands.CantRemoveItem,
				() => {
					vscode.window.showInformationMessage(
						"You can only remove items that were directly added to the view"
					);
				}
			),

			vscode.commands.registerCommand(
				DirectoryProviderCommands.RemoveAllItems,
				() => directoryProvider.removeAllItems()
			),
		]
	);
}

export function deactivate() {}
