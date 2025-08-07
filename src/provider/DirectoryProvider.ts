// DirectoryProvider.ts

import * as vscode from "vscode";
import { FileSystemObject } from "../types/FileSystemObject";
import { DirectoryWorker } from "../operator/DirectoryWorker";

// -----------------------------------------------------------------------------------------------------------------
export class DirectoryProvider implements vscode.TreeDataProvider<FileSystemObject> {

	// 0. 상수 및 상태 변수 ----------------------------------------------------------------------------------------
	private _onDidChangeTreeData: vscode.EventEmitter<
		FileSystemObject | undefined | null
	> = new vscode.EventEmitter<FileSystemObject | undefined | null>();

	readonly onDidChangeTreeData: vscode.Event<
		FileSystemObject | undefined | null
	> = this._onDidChangeTreeData.event;


	// ★ 트리뷰 마지막 선택된 uri 기억용 변수 -----------------------------------------------------------
	private lastSelectedUri: vscode.Uri | undefined = undefined;

	// 0. 생성자 --------------------------------------------------------------------------------------------------
	constructor (
		private directoryOperator: DirectoryWorker,
	) {}

	// 1. 트리뷰 선택 정보 set/get 메서드 ----------------------------------------------------------------------
	getLastSelectedUri(): vscode.Uri | undefined {
		return this.lastSelectedUri;
	}
	setLastSelectedUri(uri: vscode.Uri) {
		this.lastSelectedUri = uri;
	}

	// 1. 트리 아이템 -----------------------------------------------------------------------------------------------
	async getTreeItem (
		element: FileSystemObject
	): Promise<vscode.TreeItem> {
		return element;
	}

	// 2. 자식 요소 가져오기 ----------------------------------------------------------------------------------------
	async getChildren (element?: FileSystemObject): Promise<FileSystemObject[]> {
		return await this.directoryOperator.getChildren(element);
	}

	// 3. 북마크 아이템 열기/선택 (실제 로직은 worker에서 처리) -----------------------------------------------------
	async selectItem (uri: vscode.Uri | undefined) {
		await this.directoryOperator.openOrReveal(uri);
		this.refresh();
	}

	// 4. 북마크 추가 ---------------------------------------------------------------------------------------------
	async addItem (uri: vscode.Uri | undefined) {
		await this.directoryOperator.addItem(uri);
		this.refresh();
	}

	// 5. 북마크 아이템 제거 ---------------------------------------------------------------------------------------
	async removeItem (uri: vscode.Uri | undefined) {
		if (uri) {
			await this.directoryOperator.removeItem(uri.path);
			this.refresh();
		}
	}

	// 6. 모든 아이템 제거 ------------------------------------------------------------------------------------------
	async removeAllItems () {
		this.directoryOperator.removeAllItems();
		this.refresh();
	}

	// 7. 트리 새로고침 -------------------------------------------------------------------------------------------
	async refresh (): Promise<void> {
		this._onDidChangeTreeData.fire();
	}
}
