import * as vscode from "vscode";
import { BookmarkMetadata, BookmarkStatus } from "../types/BookmarkTypes";

// -------------------------------------------------------------------------------------------------------------
export class BookmarkSystemItem extends vscode.TreeItem {
    public readonly originalPath: string;
    public readonly bookmarkMetadata: BookmarkMetadata;
    public readonly status: BookmarkStatus;

    constructor(
        metadata: BookmarkMetadata,
        status: BookmarkStatus = BookmarkStatus.SYNCED,
        options?: { contextValueOverride?: string }
    ) {
        const collapsibleState = metadata.isFile
        ? vscode.TreeItemCollapsibleState.None
        : vscode.TreeItemCollapsibleState.Collapsed;

        super(metadata.bookmarkName, collapsibleState);

        this.originalPath = metadata.originalPath;
        this.bookmarkMetadata = metadata;
        this.status = status;

        this.resourceUri = vscode.Uri.file(metadata.originalPath);
        this.contextValue = options?.contextValueOverride
            ? options.contextValueOverride
            : (metadata.isFile ? "bookmarkFile" : "bookmarkFolder");

        this.setupDisplay();
    }

    // ---------------------------------------------------------------------------------------------
    // 트리 항목 UI 설정
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

        this.tooltip = new vscode.MarkdownString(`**${this.bookmarkMetadata.bookmarkName}**\n\n**Original Path:** ${this.originalPath}`);
        if (!(this.bookmarkMetadata.isFile && this.status === BookmarkStatus.SYNCED)) {
            this.command = undefined;
        }
        else {
            this.command = {
                command: "vscode.open",
                title: "Open Original File",
                arguments: [vscode.Uri.file(this.originalPath)]
            };
        }
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
    // ---------------------------------------------------------------------------------------------
    get isOriginalAvailable(): boolean {
        return this.status === BookmarkStatus.SYNCED || this.status === BookmarkStatus.MODIFIED;
    }
}
