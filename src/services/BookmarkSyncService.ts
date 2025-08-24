// services/BookmarkSyncService.ts

import * as vscode from "vscode";
import * as path from "path";
import { BookmarkMetadata, BookmarkStatus } from "../types/BookmarkTypes";
import { TextEncoder } from "util";

// -------------------------------------------------------------------------------------------------------------
export class BookmarkSyncService {
    private bookmarkWatchers: Map<string, vscode.FileSystemWatcher> = new Map();
    private bookmarkedFiles: Map<string, BookmarkMetadata> = new Map();
    private readonly METADATA_EXT = '.bookmark.json';
    private disposables: vscode.Disposable[] = [];

    constructor(
        private bookmarkPath: string,
        private onSyncUpdate?: (path: string, status: BookmarkStatus) => void,
        private onRefreshNeeded?: () => void
    ) {
        this.setupEventListeners();
        this.loadExistingBookmarks();
    }

    // ---------------------------------------------------------------------------------------------
    // 이벤트 기반 동기화 설정
    // - 저장/변경/생성/삭제 이벤트 감지 시 북마크 상태 갱신
    // ---------------------------------------------------------------------------------------------
    private setupEventListeners(): void {
        const saveListener = vscode.workspace.onDidSaveTextDocument(async (document) => {
            const filePath = document.uri.fsPath;
            if (this.isBookmarkedFile(filePath)) {
                console.debug(`File saved: ${filePath} - syncing bookmark`);
                await this.syncBookmark(filePath);
            }
        });

        const fsWatcher = vscode.workspace.createFileSystemWatcher('**/*');

        fsWatcher.onDidChange(async (uri) => {
            if (this.isBookmarkedFile(uri.fsPath)) {
                console.debug(`File changed: ${uri.fsPath} - syncing bookmark`);
                await this.syncBookmark(uri.fsPath);
            }
        });

        fsWatcher.onDidCreate(async (uri) => {
            if (this.isBookmarkedFile(uri.fsPath)) {
                console.debug(`File created: ${uri.fsPath} - updating bookmark status`);
                await this.updateBookmarkStatus(uri.fsPath, BookmarkStatus.SYNCED);
            }
        });

        fsWatcher.onDidDelete(async (uri) => {
            if (this.isBookmarkedFile(uri.fsPath)) {
                console.debug(`File deleted: ${uri.fsPath} - marking as missing`);
                await this.updateBookmarkStatus(uri.fsPath, BookmarkStatus.MISSING);
            }
        });

        this.disposables.push(saveListener, fsWatcher);
    }

    // ---------------------------------------------------------------------------------------------
    // 기존 북마크 로드
    // - .bookmark 폴더에서 메타데이터 파일(.bookmark.json) 읽기
    // - 상태 확인 후 UI 갱신 콜백 호출
    // ---------------------------------------------------------------------------------------------
    private async loadExistingBookmarks(): Promise<void> {
        try {
            const entries = await vscode.workspace.fs.readDirectory(vscode.Uri.file(this.bookmarkPath));

            for (const [name] of entries) {
                if (name.endsWith(this.METADATA_EXT)) {
                    const metadataPath = path.join(this.bookmarkPath, name);
                    try {
                        const metadata = await this.loadMetadata(metadataPath);
                        if (metadata) {
                            this.bookmarkedFiles.set(metadata.originalPath, metadata);
                            const status = await this.checkBookmarkStatus(metadata);
                            if (this.onSyncUpdate) {
                                this.onSyncUpdate(metadata.originalPath, status);
                            }
                        }
                    }
                    catch (error) {
                        console.error(`Failed to load bookmark metadata: ${metadataPath}`, error);
                    }
                }
            }

            if (this.onRefreshNeeded) {
                this.onRefreshNeeded();
            }
        }
        catch (error) {
            console.error('Failed to load existing bookmarks:', error);
        }
    }

    // ---------------------------------------------------------------------------------------------
    // 북마크 추가 (메타데이터 생성 및 저장)
    // ---------------------------------------------------------------------------------------------
    async addBookmark(originalPath: string, bookmarkName?: string): Promise<void> {
        try {
            const stat = await vscode.workspace.fs.stat(vscode.Uri.file(originalPath));

            const baseName = path.basename(originalPath);
            const finalBookmarkName = bookmarkName || baseName;
            const uniqueBookmarkName = this.generateUniqueBookmarkName(finalBookmarkName);

            const metadata: BookmarkMetadata = {
                originalPath: originalPath,
                bookmarkName: uniqueBookmarkName,
                isFile: stat.type === vscode.FileType.File,
                createdAt: Date.now(),
                lastSyncAt: Date.now(),
                originalExists: true
            };

            const metadataPath = path.join(this.bookmarkPath, `${uniqueBookmarkName}${this.METADATA_EXT}`);
            await this.saveMetadata(metadataPath, metadata);

            this.bookmarkedFiles.set(originalPath, metadata);

            console.debug(`Bookmark added: ${originalPath} -> ${uniqueBookmarkName}`);

            if (this.onSyncUpdate) {
                this.onSyncUpdate(originalPath, BookmarkStatus.SYNCED);
            }
            if (this.onRefreshNeeded) {
                this.onRefreshNeeded();
            }
        }
        catch (error) {
            throw new Error(`Failed to add bookmark: ${error}`);
        }
    }

    // ---------------------------------------------------------------------------------------------
    // 고유한 북마크 이름 생성 (중복 방지)
    // ---------------------------------------------------------------------------------------------
    private generateUniqueBookmarkName(bookmarkName: string): string {
        let uniqueName = bookmarkName;
        let counter = 1;

        while (this.isBookmarkNameExists(uniqueName)) {
            const ext = path.extname(bookmarkName);
            const baseName = path.basename(bookmarkName, ext);
            uniqueName = `${baseName}_${counter}${ext}`;
            counter++;
        }

        return uniqueName;
    }

    private isBookmarkNameExists(bookmarkName: string): boolean {
        return Array.from(this.bookmarkedFiles.values()).some(
            metadata => metadata.bookmarkName === bookmarkName
        );
    }

    // ---------------------------------------------------------------------------------------------
    // 북마크 제거 (메타데이터 파일 삭제 및 캐시 갱신)
    // ---------------------------------------------------------------------------------------------
    async removeBookmark(originalPath: string): Promise<void> {
        const metadata = this.bookmarkedFiles.get(originalPath);
        if (!metadata) {
            return;
        }

        try {
            const metadataPath = path.join(this.bookmarkPath, `${metadata.bookmarkName}${this.METADATA_EXT}`);
            await vscode.workspace.fs.delete(vscode.Uri.file(metadataPath));

            this.bookmarkedFiles.delete(originalPath);

            console.debug(`Bookmark removed: ${originalPath}`);

            if (this.onRefreshNeeded) {
                this.onRefreshNeeded();
            }
        }
        catch (error) {
            console.error(`Failed to remove bookmark: ${error}`);
        }
    }

    // ---------------------------------------------------------------------------------------------
    // 특정 북마크 동기화 (즉시 메타데이터 갱신)
    // - 존재하면 SYNCED, 없으면 MISSING 처리
    // ---------------------------------------------------------------------------------------------
    private async syncBookmark(originalPath: string): Promise<void> {
        const metadata = this.bookmarkedFiles.get(originalPath);
        if (!metadata) {
            return;
        }

        try {
            await vscode.workspace.fs.stat(vscode.Uri.file(originalPath));

            metadata.lastSyncAt = Date.now();
            metadata.originalExists = true;

            const metadataPath = path.join(this.bookmarkPath, `${metadata.bookmarkName}${this.METADATA_EXT}`);
            await this.saveMetadata(metadataPath, metadata);

            if (this.onSyncUpdate) {
                this.onSyncUpdate(originalPath, BookmarkStatus.SYNCED);
            }
            if (this.onRefreshNeeded) {
                this.onRefreshNeeded();
            }

            console.debug(`Bookmark synced: ${originalPath}`);
        }
        catch (error) {
            metadata.originalExists = false;

            const metadataPath = path.join(this.bookmarkPath, `${metadata.bookmarkName}${this.METADATA_EXT}`);
            try {
                await this.saveMetadata(metadataPath, metadata);
            }
            catch {
                // 저장 실패는 무시
            }

            if (this.onSyncUpdate) {
                this.onSyncUpdate(originalPath, BookmarkStatus.MISSING);
            }

            console.debug(`Bookmark file missing: ${originalPath}`);
        }
    }

    // ---------------------------------------------------------------------------------------------
    // 북마크 상태 갱신 (외부 이벤트 발생 시)
    // ---------------------------------------------------------------------------------------------
    private async updateBookmarkStatus(originalPath: string, status: BookmarkStatus): Promise<void> {
        if (this.onSyncUpdate) {
            this.onSyncUpdate(originalPath, status);
        }

        if (this.onRefreshNeeded) {
            this.onRefreshNeeded();
        }
    }

    // ---------------------------------------------------------------------------------------------
    // 북마크 상태 확인 (파일 존재 여부 검사)
    // ---------------------------------------------------------------------------------------------
    private async checkBookmarkStatus(metadata: BookmarkMetadata): Promise<BookmarkStatus> {
        try {
            await vscode.workspace.fs.stat(vscode.Uri.file(metadata.originalPath));
            return BookmarkStatus.SYNCED;
        }
        catch {
            return BookmarkStatus.MISSING;
        }
    }

    // ---------------------------------------------------------------------------------------------
    // 북마크 여부 확인
    // ---------------------------------------------------------------------------------------------
    private isBookmarkedFile(filePath: string): boolean {
        return this.bookmarkedFiles.has(filePath);
    }

    // ---------------------------------------------------------------------------------------------
    // 메타데이터 조회
    // ---------------------------------------------------------------------------------------------
    getAllBookmarks(): BookmarkMetadata[] {
        return Array.from(this.bookmarkedFiles.values());
    }

    getBookmark(originalPath: string): BookmarkMetadata | undefined {
        return this.bookmarkedFiles.get(originalPath);
    }

    // ---------------------------------------------------------------------------------------------
    // 원본 경로 변경 시 메타데이터 갱신
    // ---------------------------------------------------------------------------------------------
    async updateOriginalPath(oldPath: string, newPath: string): Promise<void> {
        const metadata = this.bookmarkedFiles.get(oldPath);
        if (!metadata) {
            return;
        }

        this.bookmarkedFiles.delete(oldPath);
        metadata.originalPath = newPath;

        const metadataPath = path.join(this.bookmarkPath, `${metadata.bookmarkName}${this.METADATA_EXT}`);
        await this.saveMetadata(metadataPath, metadata);

        this.bookmarkedFiles.set(newPath, metadata);

        if (this.onSyncUpdate) {
            this.onSyncUpdate(newPath, BookmarkStatus.SYNCED);
        }
        if (this.onRefreshNeeded) {
            this.onRefreshNeeded();
        }
    }

    // ---------------------------------------------------------------------------------------------
    // 메타데이터 저장 / 로드
    // ---------------------------------------------------------------------------------------------
    private async saveMetadata(metadataPath: string, metadata: BookmarkMetadata): Promise<void> {
        const content = JSON.stringify(metadata, null, 2);
        await vscode.workspace.fs.writeFile(vscode.Uri.file(metadataPath), new TextEncoder().encode(content));
    }

    private async loadMetadata(metadataPath: string): Promise<BookmarkMetadata | null> {
        try {
            const content = await vscode.workspace.fs.readFile(vscode.Uri.file(metadataPath));
            return JSON.parse(content.toString()) as BookmarkMetadata;
        }
        catch {
            return null;
        }
    }

    // ---------------------------------------------------------------------------------------------
    // 리소스 정리 (watcher 및 캐시 해제)
    // ---------------------------------------------------------------------------------------------
    dispose(): void {
        this.disposables.forEach(d => d.dispose());
        this.bookmarkWatchers.forEach(watcher => watcher.dispose());
        this.bookmarkWatchers.clear();
        this.bookmarkedFiles.clear();
    }
}
