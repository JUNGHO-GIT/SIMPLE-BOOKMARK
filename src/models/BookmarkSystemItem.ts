// models/BookmarkSystemItem.ts

import * as vscode from "vscode";
import { BookmarkMetadata, BookmarkStatus } from "../types/BookmarkTypes.js";

// -----------------------------------------------------------------------------------------
export type BookmarkSystemItem = vscode.TreeItem & {
	originalPath: string;
	bookmarkMetadata: BookmarkMetadata;
	status: BookmarkStatus;
	isOriginalAvailable: boolean;
	updateStatus: (newStatus: BookmarkStatus) => void;
};

// 트리 항목 UI 설정 ------------------------------------------------------------------------
const setupDisplay = (item: BookmarkSystemItem): void => {
	const baseName = item.bookmarkMetadata.bookmarkName;

	switch (item.status) {
		case BookmarkStatus.SYNCED:
			item.label = baseName;
			item.description = "";
			item.iconPath = item.bookmarkMetadata.isFile
				? new vscode.ThemeIcon("file", new vscode.ThemeColor("foreground"))
				: new vscode.ThemeIcon("folder", new vscode.ThemeColor("foreground"));
			break;
		case BookmarkStatus.MISSING:
			item.label = baseName;
			item.description = "(missing)";
			item.iconPath = item.bookmarkMetadata.isFile
				? new vscode.ThemeIcon("file", new vscode.ThemeColor("errorForeground"))
				: new vscode.ThemeIcon("folder", new vscode.ThemeColor("errorForeground"));
			break;
		case BookmarkStatus.MODIFIED:
			item.label = baseName;
			item.description = "(modified)";
			item.iconPath = item.bookmarkMetadata.isFile
				? new vscode.ThemeIcon("file", new vscode.ThemeColor("gitModified"))
				: new vscode.ThemeIcon("folder", new vscode.ThemeColor("gitModified"));
			break;
		case BookmarkStatus.ERROR:
			item.label = baseName;
			item.description = "(error)";
			item.iconPath = item.bookmarkMetadata.isFile
				? new vscode.ThemeIcon("file", new vscode.ThemeColor("errorForeground"))
				: new vscode.ThemeIcon("folder", new vscode.ThemeColor("errorForeground"));
			break;
	}

	item.tooltip = new vscode.MarkdownString(`**${item.bookmarkMetadata.bookmarkName}**\n\n**Original Path:** ${item.originalPath}`);
	item.command = (
		item.bookmarkMetadata.isFile && item.status === BookmarkStatus.SYNCED
			? {
				command: "vscode.open",
				title: "Open Original File",
				arguments: [vscode.Uri.file(item.originalPath)]
			}
			: undefined
	);
};

// 상태 업데이트 (UI 재설정 포함) ---------------------------------------------------------
const updateStatus = function (this: BookmarkSystemItem, newStatus: BookmarkStatus): void {
	(this.status !== newStatus) && ((this as any).status = newStatus, setupDisplay(this));
};

// 원본 파일 사용 가능 여부 확인 -----------------------------------------------------------
const computeIsOriginalAvailable = (status: BookmarkStatus): boolean =>
	status === BookmarkStatus.SYNCED || status === BookmarkStatus.MODIFIED;

export const createBookmarkSystemItem = (
	metadata: BookmarkMetadata,
	status: BookmarkStatus = BookmarkStatus.SYNCED,
	options?: { contextValueOverride?: string; }
): BookmarkSystemItem => {
	const collapsibleState = metadata.isFile
		? vscode.TreeItemCollapsibleState.None
		: vscode.TreeItemCollapsibleState.Collapsed;

	const base = new vscode.TreeItem(metadata.bookmarkName, collapsibleState) as BookmarkSystemItem;

	base.originalPath = metadata.originalPath;
	base.bookmarkMetadata = metadata;
	base.status = status;

	base.resourceUri = vscode.Uri.file(metadata.originalPath);
	base.contextValue = options?.contextValueOverride
		? options.contextValueOverride
		: (metadata.isFile ? "bookmarkFile" : "bookmarkFolder");

	(base as any).updateStatus = updateStatus.bind(base);
	Object.defineProperty(base, "isOriginalAvailable", {
		get() { return computeIsOriginalAvailable(base.status); }
	});

	setupDisplay(base);
	return base;
};
