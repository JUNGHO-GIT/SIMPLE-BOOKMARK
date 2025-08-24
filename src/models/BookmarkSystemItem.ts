// models/BookmarkSystemItem.ts

import * as vscode from "vscode";
import { BookmarkMetadata, BookmarkStatus } from "../types/BookmarkTypes";

// -------------------------------------------------------------------------------------------------------------
export class BookmarkSystemItem extends vscode.TreeItem {
    public readonly originalPath: string;
    public readonly bookmarkMetadata: BookmarkMetadata;
    public readonly status: BookmarkStatus;

    constructor(
        metadata: BookmarkMetadata,
        status: BookmarkStatus = BookmarkStatus.SYNCED
    ) {
        const collapsibleState = metadata.isFile
		? vscode.TreeItemCollapsibleState.None
		: vscode.TreeItemCollapsibleState.Collapsed;

        super(metadata.bookmarkName, collapsibleState);

        this.originalPath = metadata.originalPath;
        this.bookmarkMetadata = metadata;
        this.status = status;

        this.resourceUri = vscode.Uri.file(metadata.originalPath);
        this.contextValue = metadata.isFile ? "bookmarkFile" : "bookmarkFolder";

        this.setupDisplay();
    }

    // ---------------------------------------------------------------------------------------------
    // 트리 항목 UI 설정
    // - 상태별 라벨, 설명, 아이콘, 커맨드 지정
    // ---------------------------------------------------------------------------------------------
    private setupDisplay(): void {
        const baseName = this.bookmarkMetadata.bookmarkName;

        switch (this.status) {
            case BookmarkStatus.SYNCED:
                this.label = baseName;
                this.description = "";
                this.iconPath = this.bookmarkMetadata.isFile
                    ? new vscode.ThemeIcon("file", new vscode.ThemeColor("foreground"))
                    : new vscode.ThemeIcon("folder", new vscode.ThemeColor("foreground"));
                break;

            case BookmarkStatus.MISSING:
                this.label = baseName;
                this.description = "(missing)";
                this.iconPath = this.bookmarkMetadata.isFile
                    ? new vscode.ThemeIcon("file", new vscode.ThemeColor("errorForeground"))
                    : new vscode.ThemeIcon("folder", new vscode.ThemeColor("errorForeground"));
                break;

            case BookmarkStatus.MODIFIED:
                this.label = baseName;
                this.description = "(modified)";
                this.iconPath = this.bookmarkMetadata.isFile
                    ? new vscode.ThemeIcon("file", new vscode.ThemeColor("gitModified"))
                    : new vscode.ThemeIcon("folder", new vscode.ThemeColor("gitModified"));
                break;

            case BookmarkStatus.ERROR:
                this.label = baseName;
                this.description = "(error)";
                this.iconPath = this.bookmarkMetadata.isFile
                    ? new vscode.ThemeIcon("file", new vscode.ThemeColor("errorForeground"))
                    : new vscode.ThemeIcon("folder", new vscode.ThemeColor("errorForeground"));
                break;
        }

        this.tooltip = this.createTooltip();

        if (this.bookmarkMetadata.isFile && this.status === BookmarkStatus.SYNCED) {
            this.command = {
                command: "vscode.open",
                title: "Open Original File",
                arguments: [vscode.Uri.file(this.originalPath)]
            };
        }
        else {
            // missing/error 상태일 때는 클릭 동작 없음
            this.command = undefined;
        }
    }

    // ---------------------------------------------------------------------------------------------
    // 툴팁 생성 (MarkdownString)
    // ---------------------------------------------------------------------------------------------
    private createTooltip(): vscode.MarkdownString {
        const tooltip = new vscode.MarkdownString();

        tooltip.appendMarkdown(`**${this.bookmarkMetadata.bookmarkName}**\n\n`);
        tooltip.appendMarkdown(`**Original Path:** ${this.originalPath}\n\n`);
        tooltip.appendMarkdown(`**Type:** ${this.bookmarkMetadata.isFile ? "File" : "Folder"}\n\n`);
        tooltip.appendMarkdown(`**Status:** ${this.status.toUpperCase()}\n\n`);

        if (this.bookmarkMetadata.lastSyncAt) {
            const lastSync = new Date(this.bookmarkMetadata.lastSyncAt).toLocaleString();
            tooltip.appendMarkdown(`**Last Sync:** ${lastSync}\n\n`);
        }

        switch (this.status) {
            case BookmarkStatus.SYNCED:
                tooltip.appendMarkdown(`✅ **File is synchronized and available**`);
                break;
            case BookmarkStatus.MISSING:
                tooltip.appendMarkdown(`❌ **Original file is missing or moved**`);
                break;
            case BookmarkStatus.MODIFIED:
                tooltip.appendMarkdown(`⚡ **File has been modified recently**`);
                break;
            case BookmarkStatus.ERROR:
                tooltip.appendMarkdown(`⚠️ **Error accessing original file**`);
                break;
        }

        return tooltip;
    }

    // ---------------------------------------------------------------------------------------------
    // 상태 업데이트 (UI 재설정 포함)
    // ---------------------------------------------------------------------------------------------
    updateStatus(newStatus: BookmarkStatus): void {
        if (this.status !== newStatus) {
            (this as any).status = newStatus;
            this.setupDisplay();
        }
    }

    // ---------------------------------------------------------------------------------------------
    // 원본 파일 사용 가능 여부 확인
    // - SYNCED 또는 MODIFIED 상태일 때 true
    // ---------------------------------------------------------------------------------------------
    get isOriginalAvailable(): boolean {
        return this.status === BookmarkStatus.SYNCED || this.status === BookmarkStatus.MODIFIED;
    }
}
