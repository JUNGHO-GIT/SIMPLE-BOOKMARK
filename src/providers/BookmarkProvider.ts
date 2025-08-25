import * as vscode from "vscode";
import * as path from "path";
import { BookmarkSystemItem } from "../models/BookmarkSystemItem";
import { BookmarkOperationService } from "../services/BookmarkOperationService";
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
    private syncService: BookmarkSyncService | undefined;
    private bookmarkStatusMap: Map<string, BookmarkStatus> = new Map();

    // refresh 디바운스
    private refreshTimer: NodeJS.Timeout | null = null;
    private refreshDebounceMs = 150;

    constructor(private workspaceRoot: string | undefined) {
        setTimeout(() => this.initializeBookmarkFolder(), 0);
    }

    // ---------------------------------------------------------------------------------------------
    // .bookmark 폴더 초기화
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
                this.syncService
            );
        }
    }

    // ---------------------------------------------------------------------------------------------
    // 트리 갱신(디바운스)
    // ---------------------------------------------------------------------------------------------
    refresh(): void {
        if (this.refreshTimer) {
            clearTimeout(this.refreshTimer);
        }
        this.refreshTimer = setTimeout(() => {
            this._onDidChangeTreeData.fire();
        }, this.refreshDebounceMs);
    }

    // ---------------------------------------------------------------------------------------------
    // 트리 항목 반환
    // ---------------------------------------------------------------------------------------------
    getTreeItem(element: BookmarkSystemItem): vscode.TreeItem {
        return element;
    }

    // ---------------------------------------------------------------------------------------------
    // 자식 항목 가져오기
    // - 최상위: 실제 루트 북마크 목록만 반환(가짜 아이템 없음)
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

            if (aIsDir && !bIsDir) {
                return -1;
            }
            if (!aIsDir && bIsDir) {
                return 1;
            }
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
                if (a[1] === vscode.FileType.Directory && b[1] !== vscode.FileType.Directory) {
                    return -1;
                }
                if (a[1] !== vscode.FileType.Directory && b[1] === vscode.FileType.Directory) {
                    return 1;
                }
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
        // 스냅샷 + 중복 제거
        const dedup = new Map<string, vscode.Uri>();
        for (const it of items) {
            if (!dedup.has(it.originalPath)) {
                dedup.set(it.originalPath, vscode.Uri.file(it.originalPath));
            }
        }
        this.copiedItems = Array.from(dedup.values());

        const message = this.copiedItems.length === 1
            ? `Copied: ${path.basename(this.copiedItems[0].fsPath)}`
            : `Copied ${this.copiedItems.length} items`;
        vscode.window.showInformationMessage(message);
    }

    async pasteItems(targetPath: string): Promise<void> {
        if (!this.fileOperationService) {
            vscode.window.showErrorMessage("File operation service not initialized.");
            return;
        }
        await this.fileOperationService.pasteItems(this.copiedItems, targetPath);
    }

    // 루트 붙여넣기: 파일명 매칭 → 각 북마크의 실제 경로에 덮어쓰기
    async pasteItemsToRoot(): Promise<void> {
        if (!this.fileOperationService || !this.syncService) {
            vscode.window.showErrorMessage("File operation service not initialized.");
            return;
        }
        const all = this.syncService.getAllBookmarks();

        const nameToOriginalPath = new Map<string, string>();
        for (const m of all) {
            if (m.isFile) {
                nameToOriginalPath.set(m.bookmarkName, m.originalPath);
            }
        }

        if (nameToOriginalPath.size === 0) {
            vscode.window.showWarningMessage("No root file bookmarks to overwrite.");
            return;
        }

        await this.fileOperationService.pasteItemsToRoot(this.copiedItems, nameToOriginalPath);
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
