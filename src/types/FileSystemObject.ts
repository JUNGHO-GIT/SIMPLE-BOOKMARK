// FileSystemObject.ts

import * as vscode from "vscode";
import { DirectoryProviderCommands } from "../commands/CrudCommands";

// -----------------------------------------------------------------------------------------------------------------
export type FileSystemObjectType = vscode.TreeItem & {
	resourceUri?: vscode.Uri;
	contextValue?: string;
};

// -----------------------------------------------------------------------------------------------------------------
// 파일 시스템 객체 생성
export const FileSystemObject = (
	label: string,
	collapsibleState: vscode.TreeItemCollapsibleState,
	uri: vscode.Uri
): FileSystemObjectType => {

	const item = new vscode.TreeItem(label, collapsibleState);
	item.tooltip = uri.fsPath;
	item.resourceUri = uri;

	// 명령어 설정
	if (collapsibleState === vscode.TreeItemCollapsibleState.None) {
		item.command = {
			arguments: [item],
			command: DirectoryProviderCommands.SelectItem,
			title: label,
		};
	}

	return item;
};

// -----------------------------------------------------------------------------------------------------------------
// contextValue 설정 함수
export const setContextValue = (
	item: FileSystemObjectType,
	value: string
): FileSystemObjectType => {
	item.contextValue = value;
	return item;
};
