// BookmarkSyncService.ts

import * as vscode from "vscode";
import * as path from "path";
import {TextEncoder} from "util";
import {BookmarkMetadata, BookmarkStatus} from "../types/BookmarkTypes.js";

// -------------------------------------------------------------------------------------------------------------
export class BookmarkSyncService {
	private bookmarkWatchers: Map<string, vscode.FileSystemWatcher> = new Map();
	private bookmarkedFiles: Map<string, BookmarkMetadata> = new Map();
	private readonly METADATA_EXT = '.bookmark.json';
	private disposables: vscode.Disposable[] = [];

	constructor (
		private bookmarkPath: string,
		private onSyncUpdate?: (path: string, status: BookmarkStatus) => void,
		private onRefreshNeeded?: () => void
	) {
		this.setupEventListeners();
		this.loadExistingBookmarks();
	}

	// ---------------------------------------------------------------------------------------------
	// 이벤트 기반 동기화 설정
	// - 글로벌 워처 제거. 북마크별 워처만 등록.
	private setupEventListeners (): void {
		const saveListener = vscode.workspace.onDidSaveTextDocument(async (document) => {
			const filePath = document.uri.fsPath;
			if (!this.isBookmarkedFile(filePath)) {
				return;
			}
			await this.syncBookmark(filePath);
		});

		this.disposables.push(saveListener);
	}

	// 파일별 워처 생성
	private createWatcherFor (originalPath: string): void {
		if (this.bookmarkWatchers.has(originalPath)) {
			return;
		}

		const pattern = new vscode.RelativePattern(path.dirname(originalPath), path.basename(originalPath));
		const watcher = vscode.workspace.createFileSystemWatcher(pattern, false, false, false);

		watcher.onDidChange(async (uri) => {
			if (uri.fsPath === originalPath) {
				await this.syncBookmark(originalPath);
			}
		});
		watcher.onDidCreate(async (uri) => {
			if (uri.fsPath === originalPath) {
				await this.updateBookmarkStatus(originalPath, BookmarkStatus.SYNCED);
			}
		});
		watcher.onDidDelete(async (uri) => {
			if (uri.fsPath === originalPath) {
				await this.updateBookmarkStatus(originalPath, BookmarkStatus.MISSING);
			}
		});

		this.bookmarkWatchers.set(originalPath, watcher);
	}

	private disposeWatcherFor (originalPath: string): void {
		const w = this.bookmarkWatchers.get(originalPath);
		if (w) {
			w.dispose();
			this.bookmarkWatchers.delete(originalPath);
		}
	}

	// ---------------------------------------------------------------------------------------------
	// 기존 북마크 로드(지연 상태 확인)
	private async loadExistingBookmarks (): Promise<void> {
		try {
			const entries = await vscode.workspace.fs.readDirectory(vscode.Uri.file(this.bookmarkPath));

			const metaPaths: string[] = [];
			for (const [name] of entries) {
				if (name.endsWith(this.METADATA_EXT)) {
					metaPaths.push(path.join(this.bookmarkPath, name));
				}
			}

			for (const metadataPath of metaPaths) {
				try {
					const metadata = await this.loadMetadata(metadataPath);
					if (metadata) {
						this.bookmarkedFiles.set(metadata.originalPath, metadata);
						this.createWatcherFor(metadata.originalPath);

						setTimeout(async () => {
							const status = await this.checkBookmarkStatus(metadata);
							if (this.onSyncUpdate) {
								this.onSyncUpdate(metadata.originalPath, status);
							}
							if (this.onRefreshNeeded) {
								this.onRefreshNeeded();
							}
						}, 100);
					}
				}
				catch (error) {
					console.error(`Failed to load bookmark metadata: ${metadataPath}`, error);
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
	async addBookmark (originalPath: string, bookmarkName?: string): Promise<void> {
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
			this.createWatcherFor(originalPath);

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
	private generateUniqueBookmarkName (bookmarkName: string): string {
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

	private isBookmarkNameExists (bookmarkName: string): boolean {
		return Array.from(this.bookmarkedFiles.values()).some(
			metadata => metadata.bookmarkName === bookmarkName
		);
	}

	// ---------------------------------------------------------------------------------------------
	// 북마크 제거
	async removeBookmark (originalPath: string): Promise<void> {
		const metadata = this.bookmarkedFiles.get(originalPath);
		if (!metadata) {
			return;
		}

		try {
			const metadataPath = path.join(this.bookmarkPath, `${metadata.bookmarkName}${this.METADATA_EXT}`);
			await vscode.workspace.fs.delete(vscode.Uri.file(metadataPath));

			this.bookmarkedFiles.delete(originalPath);
			this.disposeWatcherFor(originalPath);

			if (this.onRefreshNeeded) {
				this.onRefreshNeeded();
			}
		}
		catch (error) {
			console.error(`Failed to remove bookmark: ${error}`);
		}
	}

	// ---------------------------------------------------------------------------------------------
	// 특정 북마크 동기화
	private async syncBookmark (originalPath: string): Promise<void> {
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
		}
		catch {
			metadata.originalExists = false;

			const metadataPath = path.join(this.bookmarkPath, `${metadata.bookmarkName}${this.METADATA_EXT}`);
			try {
				await this.saveMetadata(metadataPath, metadata);
			}
			catch {
			}

			if (this.onSyncUpdate) {
				this.onSyncUpdate(originalPath, BookmarkStatus.MISSING);
			}
		}
	}

	// ---------------------------------------------------------------------------------------------
	// 북마크 상태 갱신
	private async updateBookmarkStatus (originalPath: string, status: BookmarkStatus): Promise<void> {
		if (this.onSyncUpdate) {
			this.onSyncUpdate(originalPath, status);
		}
		if (this.onRefreshNeeded) {
			this.onRefreshNeeded();
		}
	}

	// ---------------------------------------------------------------------------------------------
	// 북마크 상태 확인 (파일 존재 여부 검사)
	private async checkBookmarkStatus (metadata: BookmarkMetadata): Promise<BookmarkStatus> {
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
	private isBookmarkedFile (filePath: string): boolean {
		return this.bookmarkedFiles.has(filePath);
	}

	// ---------------------------------------------------------------------------------------------
	// 메타데이터 조회
	getAllBookmarks (): BookmarkMetadata[] {
		return Array.from(this.bookmarkedFiles.values());
	}

	getBookmark (originalPath: string): BookmarkMetadata | undefined {
		return this.bookmarkedFiles.get(originalPath);
	}

	// ---------------------------------------------------------------------------------------------
	// 원본 경로 변경 시 메타데이터 갱신
	async updateOriginalPath (oldPath: string, newPath: string): Promise<void> {
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
	private async saveMetadata (metadataPath: string, metadata: BookmarkMetadata): Promise<void> {
		const content = JSON.stringify(metadata, null, 2);
		await vscode.workspace.fs.writeFile(vscode.Uri.file(metadataPath), new TextEncoder().encode(content));
	}

	private async loadMetadata (metadataPath: string): Promise<BookmarkMetadata | null> {
		try {
			const content = await vscode.workspace.fs.readFile(vscode.Uri.file(metadataPath));
			return JSON.parse(content.toString()) as BookmarkMetadata;
		}
		catch {
			return null;
		}
	}

	// ---------------------------------------------------------------------------------------------
	// 리소스 정리
	dispose (): void {
		this.disposables.forEach(d => d.dispose());
		this.bookmarkWatchers.forEach(watcher => watcher.dispose());
		this.bookmarkWatchers.clear();
		this.bookmarkedFiles.clear();
	}
}
