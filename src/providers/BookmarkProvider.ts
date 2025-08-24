// providers/BookmarkProvider.ts

import * as vscode from "vscode";
import * as path from "path";
import { BookmarkSystemItem } from "../models/BookmarkSystemItem";
import { BookmarkOperationService } from "../services/BookmarkOperationService";
import { BookmarkHistoryService } from "../services/BookmarkHistoryService";
import { BookmarkSyncService } from "../services/BookmarkSyncService";
import { BookmarkPathUtil } from "../utils/BookmarkPathUtil";
import { BookmarkStatus } from "../types/BookmarkTypes";

// -------------------------------------------------------------------------------------------------------------
export class BookmarkProvider implements vscode.TreeDataProvider<BookmarkSystemItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<BookmarkSystemItem | undefined | null | void> = new vscode.EventEmitter<BookmarkSystemItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<BookmarkSystemItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private bookmarkPath: string | undefined;
    private copiedItems: vscode.Uri[] = [];
    private fileOperationService: BookmarkOperationService | undefined;
    private historyService: BookmarkHistoryService;
    private syncService: BookmarkSyncService | undefined;
    private bookmarkStatusMap: Map<string, BookmarkStatus> = new Map();

    constructor(private workspaceRoot: string | undefined) {
        this.historyService = new BookmarkHistoryService();
        this.initializeBookmarkFolder();
    }

    // ---------------------------------------------------------------------------------------------
    // .bookmark 폴더 초기화
    // - 존재하지 않으면 생성
    // - SyncService 및 OperationService 초기화
    // ---------------------------------------------------------------------------------------------
    private async initializeBookmarkFolder(): Promise<void> {
        if (!this.workspaceRoot) {
            return;
        }

        this.bookmarkPath = BookmarkPathUtil.getBookmarkPath(this.workspaceRoot);

        try {
            await vscode.workspace.fs.stat(vscode.Uri.file(this.bookmarkPath));
        }
        catch {
            try {
                await vscode.workspace.fs.createDirectory(vscode.Uri.file(this.bookmarkPath));
                vscode.window.showInformationMessage(`BOOKMARK folder created: ${this.bookmarkPath}`);
            }
            catch (error) {
                vscode.window.showErrorMessage(`Failed to create BOOKMARK folder: ${error}`);
                return;
            }
        }

        if (this.bookmarkPath) {
            this.syncService = new BookmarkSyncService(
                this.bookmarkPath,
                (p: string, status: BookmarkStatus) => {
                    this.bookmarkStatusMap.set(p, status);
                },
                () => this.refresh()
            );

            this.fileOperationService = new BookmarkOperationService(
                this.bookmarkPath,
                this.historyService,
                this.syncService
            );
        }
    }

    // ---------------------------------------------------------------------------------------------
    // 트리 갱신
    // ---------------------------------------------------------------------------------------------
    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    // ---------------------------------------------------------------------------------------------
    // 트리 항목 반환
    // ---------------------------------------------------------------------------------------------
    getTreeItem(element: BookmarkSystemItem): vscode.TreeItem {
        return element;
    }

    // ---------------------------------------------------------------------------------------------
    // 자식 항목 가져오기
    // - 루트 레벨 북마크
    // - 폴더일 경우 실제 하위 파일/폴더
    // ---------------------------------------------------------------------------------------------
    async getChildren(element?: BookmarkSystemItem): Promise<BookmarkSystemItem[]> {
        if (!this.bookmarkPath || !this.syncService) {
            return [];
        }

        if (!element) {
            return this.getRootBookmarks();
        }

        if (!element.bookmarkMetadata.isFile && element.isOriginalAvailable) {
            return this.getFolderContents(element.originalPath);
        }

        return [];
    }

    // ---------------------------------------------------------------------------------------------
    // 루트 레벨 북마크 가져오기
    // ---------------------------------------------------------------------------------------------
    private async getRootBookmarks(): Promise<BookmarkSystemItem[]> {
        if (!this.syncService) {
            return [];
        }

        const bookmarks = this.syncService.getAllBookmarks();
        const items: BookmarkSystemItem[] = [];

        for (const metadata of bookmarks) {
            const status = this.bookmarkStatusMap.get(metadata.originalPath) || BookmarkStatus.SYNCED;
            items.push(new BookmarkSystemItem(metadata, status));
        }

        return items.sort((a, b) => {
            const aIsDir = !a.bookmarkMetadata.isFile;
            const bIsDir = !b.bookmarkMetadata.isFile;

            if (aIsDir && !bIsDir) return -1;
            if (!aIsDir && bIsDir) return 1;
            return a.bookmarkMetadata.bookmarkName.localeCompare(b.bookmarkMetadata.bookmarkName);
        });
    }

    // ---------------------------------------------------------------------------------------------
    // 실제 폴더의 하위 항목 가져오기
    // ---------------------------------------------------------------------------------------------
    private async getFolderContents(folderPath: string): Promise<BookmarkSystemItem[]> {
        try {
            const entries = await vscode.workspace.fs.readDirectory(vscode.Uri.file(folderPath));
            const items: BookmarkSystemItem[] = [];

            const sortedEntries = entries.sort((a, b) => {
                if (a[1] === vscode.FileType.Directory && b[1] !== vscode.FileType.Directory) return -1;
                if (a[1] !== vscode.FileType.Directory && b[1] === vscode.FileType.Directory) return 1;
                return a[0].localeCompare(b[0]);
            });

            for (const [name, type] of sortedEntries) {
                const itemPath = path.join(folderPath, name);

                const virtualMetadata = {
                    originalPath: itemPath,
                    bookmarkName: name,
                    isFile: type === vscode.FileType.File,
                    createdAt: Date.now(),
                    lastSyncAt: Date.now(),
                    originalExists: true
                };

                items.push(new BookmarkSystemItem(virtualMetadata, BookmarkStatus.SYNCED));
            }

            return items;
        }
        catch (error) {
            console.error(`Error reading folder contents: ${folderPath}`, error);
            return [];
        }
    }

    // ---------------------------------------------------------------------------------------------
    // 북마크 추가
    // - 동일한 이름이 존재하면 기존 북마크 제거 후 새로 추가
    // ---------------------------------------------------------------------------------------------
    async addBookmark(sourcePath: string, bookmarkName?: string): Promise<void> {
        if (!this.syncService) {
            vscode.window.showErrorMessage("Bookmark sync service not initialized.");
            return;
        }

        try {
            const finalBookmarkName = bookmarkName || path.basename(sourcePath);

            const existing = this.syncService.getAllBookmarks()
                .filter(b => b.bookmarkName === finalBookmarkName);

            for (const meta of existing) {
                await this.syncService.removeBookmark(meta.originalPath);
            }

            await this.syncService.addBookmark(sourcePath, finalBookmarkName);
            vscode.window.showInformationMessage(`Bookmark overwritten: ${finalBookmarkName}`);
        }
        catch (error) {
            vscode.window.showErrorMessage(`Failed to add bookmark: ${error}`);
        }
    }

    // ---------------------------------------------------------------------------------------------
    // 북마크 제거 (원본 파일은 유지)
    // ---------------------------------------------------------------------------------------------
    async removeBookmark(originalPath: string): Promise<void> {
        if (!this.syncService) {
            vscode.window.showErrorMessage("Bookmark sync service not initialized.");
            return;
        }

        try {
            await this.syncService.removeBookmark(originalPath);
        }
        catch (error) {
            vscode.window.showErrorMessage(`Failed to remove bookmark: ${error}`);
        }
    }

    // ---------------------------------------------------------------------------------------------
    // 복사 / 붙여넣기
    // ---------------------------------------------------------------------------------------------
    copyItems(items: BookmarkSystemItem[]): void {
        this.copiedItems = items.map(item => vscode.Uri.file(item.originalPath));
        const message = items.length === 1
            ? `Copied: ${path.basename(items[0].originalPath)}`
            : `Copied ${items.length} items`;
        vscode.window.showInformationMessage(message);
    }

    async pasteItems(targetPath: string): Promise<void> {
        if (!this.fileOperationService) {
            vscode.window.showErrorMessage("File operation service not initialized.");
            return;
        }
        await this.fileOperationService.pasteItems(this.copiedItems, targetPath);
    }

    // ---------------------------------------------------------------------------------------------
    // 파일/폴더 생성
    // ---------------------------------------------------------------------------------------------
    async createFolder(parentPath: string, folderName: string): Promise<void> {
        if (!this.fileOperationService) {
            vscode.window.showErrorMessage("File operation service not initialized.");
            return;
        }
        await this.fileOperationService.createFolder(parentPath, folderName);
    }

    async createFile(parentPath: string, fileName: string): Promise<void> {
        if (!this.fileOperationService) {
            vscode.window.showErrorMessage("File operation service not initialized.");
            return;
        }
        await this.fileOperationService.createFile(parentPath, fileName);
    }

    // ---------------------------------------------------------------------------------------------
    // 파일 이름 변경 (실제 파일 + 메타데이터 경로 갱신)
    // ---------------------------------------------------------------------------------------------
    async renameOriginalFile(oldPath: string, newName: string): Promise<void> {
        if (!this.fileOperationService) {
            vscode.window.showErrorMessage("File operation service not initialized.");
            return;
        }
        await this.fileOperationService.renameOriginalFile(oldPath, newName);
    }

    // ---------------------------------------------------------------------------------------------
    // Undo / Redo
    // ---------------------------------------------------------------------------------------------
    async undo(): Promise<void> {
        try {
            const success = await this.historyService.undo();
            if (success) {
                this.refresh();
                vscode.window.showInformationMessage("Undo successful.");
            }
            else {
                vscode.window.showInformationMessage("Nothing to undo.");
            }
        }
        catch (error) {
            vscode.window.showErrorMessage(`Undo failed: ${error}`);
        }
    }

    async redo(): Promise<void> {
        try {
            const success = await this.historyService.redo();
            if (success) {
                this.refresh();
                vscode.window.showInformationMessage("Redo successful.");
            }
            else {
                vscode.window.showInformationMessage("Nothing to redo.");
            }
        }
        catch (error) {
            vscode.window.showErrorMessage(`Redo failed: ${error}`);
        }
    }

    // ---------------------------------------------------------------------------------------------
    // Getter 및 상태 확인
    // ---------------------------------------------------------------------------------------------
    get rootPath(): string | undefined {
        return this.bookmarkPath;
    }

    hasCopiedItems(): boolean {
        return this.copiedItems.length > 0;
    }

    getBookmarkStatus(originalPath: string): BookmarkStatus {
        return this.bookmarkStatusMap.get(originalPath) || BookmarkStatus.SYNCED;
    }

    isRootBookmark(originalPath: string): boolean {
        return !!this.syncService?.getBookmark(originalPath);
    }

    // ---------------------------------------------------------------------------------------------
    // 리소스 정리
    // ---------------------------------------------------------------------------------------------
    dispose(): void {
        if (this.syncService) {
            this.syncService.dispose();
        }
    }
}
