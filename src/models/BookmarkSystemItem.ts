// models/BookmarkSystemItem.ts

import * as vscode from "vscode";
import {BookmarkMetadata, BookmarkStatus} from "../types/BookmarkType.js";

// -----------------------------------------------------------------------------------------
export type BookmarkSystemItem = vscode.TreeItem & {
	originalPath : string;
	bookmarkMetadata : BookmarkMetadata;
	status : BookmarkStatus;
	isOriginalAvailable : boolean;
	updateStatus : (newStatus : BookmarkStatus) => void;
};

// 트리 항목 UI 설정 ------------------------------------------------------------------------
const setupDisplay = (
	item : BookmarkSystemItem
) : void => {
	const baseName = item.bookmarkMetadata.bookmarkName;
	item.label = baseName;
	const [desc, colorId] = item.status === BookmarkStatus.SYNCED
		? ["", "foreground"]
		: item.status === BookmarkStatus.MISSING
		? ["(missing)", "errorForeground"]
		: item.status === BookmarkStatus.MODIFIED
		? ["(modified)", "gitModified"]
		: ["(error)", "errorForeground"];

	item.description = desc;
	item.iconPath = item.bookmarkMetadata.isFile
	? new vscode.ThemeIcon(
		"file",
		new vscode.ThemeColor(colorId)
	)
	: new vscode.ThemeIcon(
		"folder",
		new vscode.ThemeColor(colorId)
	);

	item.tooltip = new vscode.MarkdownString(
		`**${item.bookmarkMetadata.bookmarkName}**\n\n**Original Path:** ${item.originalPath}`
	);

	item.command = item.bookmarkMetadata.isFile && item.status === BookmarkStatus.SYNCED
		? {
			command : "vscode.open",
			title : "Open Original File",
			arguments : [vscode.Uri.file(item.originalPath)]
		}
		: undefined;
};

// 상태 업데이트 (UI 재설정 포함) ---------------------------------------------------------
const updateStatus = function (
	this : BookmarkSystemItem,
	newStatus : BookmarkStatus
) : void {
	this.status !== newStatus && ((this as any).status = newStatus, setupDisplay(this));
};

// 원본 파일 사용 가능 여부 확인 -----------------------------------------------------------
const computeIsOriginalAvailable = (
	status : BookmarkStatus
) : boolean => status === BookmarkStatus.SYNCED || status === BookmarkStatus.MODIFIED;

// 팩토리 ----------------------------------------------------------------------------------
export const createBookmarkSystemItem = (
	metadata : BookmarkMetadata,
	status : BookmarkStatus = BookmarkStatus.SYNCED,
	options? : {contextValueOverride? : string;}
) : BookmarkSystemItem => {
	const collapsibleState = metadata.isFile
	? vscode.TreeItemCollapsibleState.None
	: vscode.TreeItemCollapsibleState.Collapsed;

	const base = new vscode.TreeItem(
		metadata.bookmarkName,
		collapsibleState
	) as BookmarkSystemItem;

	base.originalPath = metadata.originalPath;
	base.bookmarkMetadata = metadata;
	base.status = status;
	base.id = metadata.originalPath;
	base.resourceUri = vscode.Uri.file(metadata.originalPath);
	base.contextValue = options?.contextValueOverride || (metadata.isFile ? "bookmarkFile" : "bookmarkFolder");
	(base as any).updateStatus = updateStatus.bind(base);

	Object.defineProperty(
		base,
		"isOriginalAvailable",
		{
			get() {
				return computeIsOriginalAvailable(base.status);
			}
		}
	);

	setupDisplay(base);
	return base;
};