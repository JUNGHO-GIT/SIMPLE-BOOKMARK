import * as vscode from "vscode";
import { FileSystemObjectType } from "../types/FileSystemObject";
import { DirectoryWorker } from "./DirectoryWorker";

// -----------------------------------------------------------------------------------------------------------------
export type DirectoryProviderType = ReturnType<typeof DirectoryProvider>;

// -----------------------------------------------------------------------------------------------------------------
export function DirectoryProvider(
	directoryOperator: ReturnType<typeof DirectoryWorker>
): vscode.TreeDataProvider<FileSystemObjectType> & {
	getLastSelectedUri: () => vscode.Uri | undefined
	setLastSelectedUri: (uri: vscode.Uri) => void
	selectItem: (selectedPath: string) => Promise<void>
	addItem: (pathToAdd: string) => Promise<void>
	copyItem: (copiedPath: string) => Promise<void>
	pasteItem: (pastedPath: string, targetPath: string) => Promise<void>
	removeItem: (pathToDelete: string) => Promise<void>
	removeAllItems: () => Promise<void>
	refresh: () => Promise<void>
} {

	// 0. 상수 및 상태 변수 ----------------------------------------------------------------------------------------
	const _onDidChangeTreeData = new vscode.EventEmitter<FileSystemObjectType | undefined | null>();
	const onDidChangeTreeData = _onDidChangeTreeData.event;

	// ★ 트리뷰 마지막 선택된 uri 기억용 변수 -----------------------------------------------------------------
	let lastSelectedUri: vscode.Uri | undefined = undefined;
	let copiedUri: vscode.Uri | undefined = undefined;

	// 1. 트리뷰 선택 정보 set/get 메서드 ----------------------------------------------------------------------
	function getLastSelectedUri(): vscode.Uri | undefined {
		return lastSelectedUri;
	}
	function setLastSelectedUri(uri: vscode.Uri): void {
		lastSelectedUri = uri;
	}

	// 1. 트리 아이템 -----------------------------------------------------------------------------------------------
	async function getTreeItem(element: FileSystemObjectType): Promise<vscode.TreeItem> {
		return element;
	}

	// 2. 자식 요소 가져오기 ----------------------------------------------------------------------------------------
	async function getChildren(element?: FileSystemObjectType): Promise<FileSystemObjectType[]> {
		return await directoryOperator.getChildren(element);
	}

	// 3. 북마크 아이템 열기/선택 ------------------------------------------------------------------------------------
	async function selectItem(selectedPath: string): Promise<void> {
		if (selectedPath) {
			await directoryOperator.openOrReveal(selectedPath);
			await refresh();
		}
		else {
			vscode.window.showErrorMessage("No item selected to open.");
			return;
		}
	}

	// 4. 북마크 추가 -----------------------------------------------------------------------------------------------
	async function addItem(pathToAdd: string): Promise<void> {
		if (pathToAdd) {
			await directoryOperator.addItem(pathToAdd);
			await refresh();
		}
		else {
			vscode.window.showErrorMessage("No file or folder selected to add.");
			return;
		}
	}

	// 5. 북마크 복사 ------------------------------------------------------------------------------------------------
	async function copyItem(copiedPath: string): Promise<void> {
		if (copiedPath) {
			copiedUri = vscode.Uri.file(copiedPath);
			vscode.window.showInformationMessage(`Copied: ${copiedPath}`);
		}
		else {
			vscode.window.showErrorMessage("No item selected to copy.");
		}
	}

	// 6. 북마크 붙여넣기 ------------------------------------------------------------------------------------------
	async function pasteItem(pastedPath: string, targetPath: string): Promise<void> {
		if (!pastedPath) {
			vscode.window.showErrorMessage("No item to paste. Please copy an item first.");
			return;
		}
		if (!targetPath) {
			vscode.window.showErrorMessage("No target location selected for paste.");
			return;
		}
		await directoryOperator.pasteItem(pastedPath, targetPath);
		await refresh();
	}

	// 7. 북마크 삭제 ------------------------------------------------------------------------------------------
	async function removeItem(pathToDelete: string): Promise<void> {
		if (pathToDelete) {
			await directoryOperator.removeItem(pathToDelete);
			await refresh();
		}
		else {
			vscode.window.showErrorMessage("No file or folder selected to remove.");
			return;
		}
	}

	// 8. 북마크 전체 삭제 -------------------------------------------------------------------------------------
	async function removeAllItems(): Promise<void> {
		await directoryOperator.removeAllItems();
		await refresh();
	}

	// 9. 트리뷰 새로고침 ----------------------------------------------------------------------------------------
	async function refresh(): Promise<void> {
		_onDidChangeTreeData.fire(undefined);
	}

	// 0. return --------------------------------------------------------------------------------------------------
	return {
		onDidChangeTreeData,
		getTreeItem,
		getChildren,
		getLastSelectedUri,
		setLastSelectedUri,
		selectItem,
		addItem,
		removeItem,
		removeAllItems,
		copyItem,
		pasteItem,
		refresh
	};
}