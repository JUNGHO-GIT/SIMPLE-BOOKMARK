import * as vscode from "vscode";
import { DirectoryProviderCommands } from "../commands/CrudCommands";

// -----------------------------------------------------------------------------------------------------------------
export type FileSystemObjectType = vscode.TreeItem & {
	resourceUri?: vscode.Uri;
	contextValue?: string;
};

// -----------------------------------------------------------------------------------------------------------------
// 파일 시스템 객체 생성
export function FileSystemObject(
	label: string,
	collapsibleState: vscode.TreeItemCollapsibleState,
	uri: vscode.Uri
): FileSystemObjectType {

	const item = new vscode.TreeItem(label, collapsibleState);
	item.tooltip = uri.fsPath;
	item.resourceUri = uri;

	// 아이콘 설정 (폴더/파일 구분)
	if (collapsibleState !== vscode.TreeItemCollapsibleState.None) {
		item.iconPath = vscode.ThemeIcon.Folder;
	} else {
		item.iconPath = vscode.ThemeIcon.File;
	}

	// 명령어 설정 - 모든 항목에 동일하게 설정
	item.command = {
		arguments: [item],
		command: DirectoryProviderCommands.SelectItem,
		title: label,
	};

	return item;
}

// -----------------------------------------------------------------------------------------------------------------
// contextValue 설정 함수
export function setContextValue(
	item: FileSystemObjectType,
	value: string
): FileSystemObjectType {
	item.contextValue = value;
	return item;
}
