import * as vscode from "vscode";
import {DirectoryProvider} from "./provider/DirectoryProvider";
import {DirectoryWorker} from "./operator/DirectoryWorker";
import {DirectoryProviderCommands} from "./commands/CrudCommands";
import {vsCodeCommands} from "./commands/CrudCommands";

export function activate (context: vscode.ExtensionContext) {
	const directoryOperator = new DirectoryWorker(
		context,
		vscode.workspace.workspaceFolders
	);

	const directoryProvider = new DirectoryProvider(
		directoryOperator
	);

	vscode.window.registerTreeDataProvider(
		"explorer-bookmark",
		directoryProvider
	);

    // explorer에서 선택된 리소스 URI를 강제로 감지(clipboard 사용)
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
			vscode.commands.registerCommand(
				DirectoryProviderCommands.RefreshEntry,
				() => directoryProvider.refresh()
			),
			vscode.commands.registerCommand(
				DirectoryProviderCommands.OpenItem,
				(file) => {
					vscode.commands.executeCommand(
						vsCodeCommands.Open,
						vscode.Uri.parse(file.resourceUri.path)
					);
				}
			),
			// 단축키/컨텍스트 메뉴 모두 지원하는 북마크 추가
			vscode.commands.registerCommand(
				DirectoryProviderCommands.SelectItem,
				async (args) => {
					let targetUri;

					// 1. context menu(폴더/파일): resourceUri/path 우선
					if (args && args.resourceUri) {
						targetUri = args.resourceUri;
					} else if (args && args.path) {
						targetUri = vscode.Uri.parse(args.path);
					}

					// 2. 단축키 등 args 없음: explorer에서 선택된 폴더/파일 clipboard로 감지
					if (!targetUri) {
						targetUri = await getExplorerSelectedResourceUri();
					}

					// 3. 그래도 없으면 에디터 열린 파일 fallback
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
			vscode.commands.registerCommand(
				DirectoryProviderCommands.RemoveItem,
				(args) => {
					directoryProvider.removeItem(args.resourceUri);
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

export function deactivate () {}
