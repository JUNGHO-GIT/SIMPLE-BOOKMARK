import * as vscode from "vscode";
import {FileSystemObject} from "../types/FileSystemObject";
import {DirectoryWorker} from "../operator/DirectoryWorker";

export class DirectoryProvider
	implements vscode.TreeDataProvider<FileSystemObject> {
	private _onDidChangeTreeData: vscode.EventEmitter<
		FileSystemObject | undefined | null | void
	> = new vscode.EventEmitter<FileSystemObject | undefined | null | void>();

	readonly onDidChangeTreeData: vscode.Event<
		FileSystemObject | undefined | null | void
	> = this._onDidChangeTreeData.event;

	constructor (
		private directoryOperator: DirectoryWorker,
	) {}

	getTreeItem (
		element: FileSystemObject
	): vscode.TreeItem | Thenable<vscode.TreeItem> {
		return element;
	}

	async getChildren (element?: FileSystemObject): Promise<FileSystemObject[]> {
		return await this.directoryOperator.getChildren(element);
	}

	async selectItem (uri: vscode.Uri | undefined) {
		await this.directoryOperator.selectItem(uri);
		this.refresh();
	}

	async removeItem (uri: vscode.Uri | undefined) {
		await this.directoryOperator.removeItem(uri);
		this.refresh();
	}

	removeAllItems () {
		this.directoryOperator.removeAllItems();
		this.refresh();
	}

	refresh (): void {
		this._onDidChangeTreeData.fire();
	}
}
