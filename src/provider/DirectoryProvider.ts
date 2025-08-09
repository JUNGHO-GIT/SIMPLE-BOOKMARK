// DirectoryProvider.ts

import * as vscode from "vscode";
import { FileSystemObjectType } from "../types/FileSystemObject";
import { DirectoryWorker } from "../operator/DirectoryWorker";

// -----------------------------------------------------------------------------------------------------------------
export type DirectoryProviderType = ReturnType<typeof DirectoryProvider>;
export const DirectoryProvider = (
	directoryOperator: ReturnType<typeof DirectoryWorker>
): vscode.TreeDataProvider<FileSystemObjectType> & {
	getLastSelectedUri: () => vscode.Uri | undefined
	setLastSelectedUri: (uri: vscode.Uri) => void
	selectItem: (uri:string | undefined) => Promise<void>
	addItem: (uri: string | undefined) => Promise<void>
	removeItem: (uri: string | undefined) => Promise<void>
	removeAllItems: () => Promise<void>
	refresh: () => Promise<void>
} => {

	// 0. 상수 및 상태 변수 ----------------------------------------------------------------------------------------
	const _onDidChangeTreeData = new vscode.EventEmitter<FileSystemObjectType | undefined | null>();
	const onDidChangeTreeData = _onDidChangeTreeData.event;

	// ★ 트리뷰 마지막 선택된 uri 기억용 변수 -----------------------------------------------------------------
	let lastSelectedUri: vscode.Uri | undefined = undefined;

	// 1. 트리뷰 선택 정보 set/get 메서드 ----------------------------------------------------------------------
	const getLastSelectedUri = (): vscode.Uri | undefined => {
		return lastSelectedUri;
	};
	const setLastSelectedUri = (uri: vscode.Uri) => {
		lastSelectedUri = uri;
	};

	// 1. 트리 아이템 -----------------------------------------------------------------------------------------------
	const getTreeItem = async (element: FileSystemObjectType): Promise<vscode.TreeItem> => {
		return element;
	};

	// 2. 자식 요소 가져오기 ----------------------------------------------------------------------------------------
	const getChildren = async (element?: FileSystemObjectType): Promise<FileSystemObjectType[]> => {
		return await directoryOperator.getChildren(element);
	};

	// 3. 북마크 아이템 열기/선택 ------------------------------------------------------------------------------------
	const selectItem = async (uri: string | undefined) => {
		if (uri) {
			await directoryOperator.openOrReveal(uri);
			await refresh();
		}
		else {
			vscode.window.showErrorMessage("No item selected to open.");
			return;
		}
	};

	// 4. 북마크 추가 -----------------------------------------------------------------------------------------------
	const addItem = async (uri: string | undefined) => {
		if (uri) {
			await directoryOperator.addItem(uri);
			await refresh();
		}
		else {
			vscode.window.showErrorMessage("No file or folder selected to add.");
			return;
		}
	};

	// 5. 북마크 아이템 제거 (경로 형식 통일 적용) ----------------------------------------------------------------
	const removeItem = async (uri: string | undefined) => {
		if (uri) {
			await directoryOperator.removeItem(uri);
			await refresh();
		}
		else {
			vscode.window.showErrorMessage("No file or folder selected to remove.");
			return;
		}
	};

	// 6. 모든 아이템 제거 ------------------------------------------------------------------------------------------
	const removeAllItems = async () => {
		await directoryOperator.removeAllItems();
		await refresh();
	};

	// 7. 트리 새로고침 -------------------------------------------------------------------------------------------
	const refresh = async (): Promise<void> => {
		_onDidChangeTreeData.fire();
	};

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
		refresh
	};
};