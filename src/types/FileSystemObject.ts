// FileSystemObject.ts

import * as vscode from "vscode";
import {DirectoryProviderCommands} from "../commands/CrudCommands";

// -----------------------------------------------------------------------------------------------------------------
export class FileSystemObject extends vscode.TreeItem {
	constructor (
		public readonly label: string,
		public readonly collapsibleState: vscode.TreeItemCollapsibleState,
		public uri: vscode.Uri
	) {
		super(label, collapsibleState);
		this.tooltip = uri.fsPath;
		this.resourceUri = uri;
		this.command = collapsibleState === vscode.TreeItemCollapsibleState.None ? {
			arguments: [this],
			command: DirectoryProviderCommands.OpenItem,
			title: this.label,
		} : undefined;
	}
	setContextValue (value: string) {
		this.contextValue = value;
		return this;
	}
}
