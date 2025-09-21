// services/BookmarkSyncService.ts

import * as vscode from "vscode";
import * as path from "path";
import { TextEncoder } from "util";
import { BookmarkMetadata, BookmarkStatus } from "../types/BookmarkTypes.js";
import { validateFileName } from "../utils/BookmarkPathUtil.js";

// -----------------------------------------------------------------------------------------
export type BookmarkSyncService = ReturnType<typeof createBookmarkSyncService>;

export const createBookmarkSyncService = (
	bookmarkPath: string,
	onSyncUpdate?: (p: string, status: BookmarkStatus) => void,
	onRefreshNeeded?: () => void
) => {
	console.debug("[Simple-Bookmark.sync] init path =", bookmarkPath);

	const bookmarkWatchers = new Map<string, vscode.FileSystemWatcher>();
	const bookmarkedFiles = new Map<string, BookmarkMetadata>();
	const METADATA_EXT = ".bookmark.json";
	const disposables: vscode.Disposable[] = [];

	// 유틸 -------------------------------------------------------------------------------
	const fileExists = async (p: string): Promise<boolean> => {
		try {
			await vscode.workspace.fs.stat(vscode.Uri.file(p));
			return true;
		} catch { return false; }
	};

	const preserveExt = (originalPath: string, newNameRaw: string, isFile: boolean): string => {
		if (!isFile) {
			return newNameRaw;
		}
		const hasDot = newNameRaw.includes(".");
		if (hasDot) {
			return newNameRaw;
		}
		const ext = path.extname(originalPath);
		return ext ? `${newNameRaw}${ext}` : newNameRaw;
	};

	const generateUniqueFsName = async (dir: string, baseName: string): Promise<string> => {
		let name = baseName;
		let i = 1;
		while (await fileExists(path.join(dir, name))) {
			const ext = path.extname(baseName);
			const stem = path.basename(baseName, ext);
			name = `${stem}_${i}${ext}`;
			i++;
		}
		return name;
	};

	// 이벤트 기반 동기화 설정 ----------------------------------------------------------------
	// - 글로벌 워처 제거. 북마크별 워처만 등록.
	const setupEventListeners = (): void => {
		const saveListener = vscode.workspace.onDidSaveTextDocument(async (document) => {
			const filePath = document.uri.fsPath;
			if (!isBookmarkedFile(filePath)) {
				return;
			}
			console.debug("[Simple-Bookmark.sync.save-hit]", filePath);
			await syncBookmark(filePath);
		});

		disposables.push(saveListener);
	};

	// 파일별 워처 생성 --------------------------------------------------------------------
	const createWatcherFor = (originalPath: string): void => {
		if (bookmarkWatchers.has(originalPath)) {
			return;
		}

		const pattern = new vscode.RelativePattern(path.dirname(originalPath), path.basename(originalPath));
		const watcher = vscode.workspace.createFileSystemWatcher(pattern, false, false, false);

		watcher.onDidChange(async (uri) => {
			if (uri.fsPath === originalPath) {
				console.debug("[Simple-Bookmark.sync.change]", originalPath);
				await syncBookmark(originalPath);
			}
		});
		watcher.onDidCreate(async (uri) => {
			if (uri.fsPath === originalPath) {
				await updateBookmarkStatus(originalPath, BookmarkStatus.SYNCED);
			}
		});
		watcher.onDidDelete(async (uri) => {
			if (uri.fsPath === originalPath) {
				await updateBookmarkStatus(originalPath, BookmarkStatus.MISSING);
			}
		});

		bookmarkWatchers.set(originalPath, watcher);
	};

	const disposeWatcherFor = (originalPath: string): void => {
		const w = bookmarkWatchers.get(originalPath);
		if (w) {
			w.dispose();
			bookmarkWatchers.delete(originalPath);
		}
	};

	// 기존 북마크 로드(지연 상태 확인) ------------------------------------------------------
	const loadExistingBookmarks = async (): Promise<void> => {
		try {
			const entries = await vscode.workspace.fs.readDirectory(vscode.Uri.file(bookmarkPath));

			const metaPaths: string[] = [];
			for (const [name] of entries) {
				if (name.endsWith(METADATA_EXT)) {
					metaPaths.push(path.join(bookmarkPath, name));
				}
			}

			for (const metadataPath of metaPaths) {
				try {
					const metadata = await loadMetadata(metadataPath);
					if (metadata) {
						bookmarkedFiles.set(metadata.originalPath, metadata);
						createWatcherFor(metadata.originalPath);

						setTimeout(async () => {
							const status = await checkBookmarkStatus(metadata);
							onSyncUpdate && onSyncUpdate(metadata.originalPath, status);
							onRefreshNeeded && onRefreshNeeded();
						}, 100);
					}
				}
				catch (error) {
					console.error(`Failed to load bookmark metadata: ${metadataPath}`, error);
				}
			}

			onRefreshNeeded && onRefreshNeeded();
		}
		catch (error) {
			console.error("Failed to load existing bookmarks:", error);
		}
	};

	// 북마크 추가 (메타데이터 생성 및 저장) ------------------------------------------------
	const addBookmark = async (originalPath: string, bookmarkName?: string): Promise<void> => {
		try {
			const stat = await vscode.workspace.fs.stat(vscode.Uri.file(originalPath));

			const baseName = path.basename(originalPath);
			const finalBookmarkName = bookmarkName || baseName;
			const uniqueBookmarkName = generateUniqueBookmarkName(finalBookmarkName);

			const metadata: BookmarkMetadata = {
				originalPath: originalPath,
				bookmarkName: uniqueBookmarkName,
				isFile: stat.type === vscode.FileType.File,
				createdAt: Date.now(),
				lastSyncAt: Date.now(),
				originalExists: true
			};

			const metadataPath = path.join(bookmarkPath, `${uniqueBookmarkName}${METADATA_EXT}`);
			await saveMetadata(metadataPath, metadata);

			bookmarkedFiles.set(originalPath, metadata);
			createWatcherFor(originalPath);

			onSyncUpdate && onSyncUpdate(originalPath, BookmarkStatus.SYNCED);
			onRefreshNeeded && onRefreshNeeded();

			console.debug("[Simple-Bookmark.sync.add]", uniqueBookmarkName);
		}
		catch (error) {
			throw new Error(`Failed to add bookmark: ${error}`);
		}
	};

	// 고유한 북마크 이름 생성 (중복 방지) -------------------------------------------------
	const generateUniqueBookmarkName = (bookmarkName: string): string => {
		let uniqueName = bookmarkName;
		let counter = 1;

		while (isBookmarkNameExists(uniqueName)) {
			const ext = path.extname(bookmarkName);
			const baseName = path.basename(bookmarkName, ext);
			uniqueName = `${baseName}_${counter}${ext}`;
			counter++;
		}

		return uniqueName;
	};

	const isBookmarkNameExists = (name: string): boolean =>
		Array.from(bookmarkedFiles.values()).some(m => m.bookmarkName === name);

	// 북마크 이름 변경 --------------------------------------------------------------------
	const renameBookmark = async (originalPath: string, newNameRaw: string): Promise<void> => {
		const metadata = bookmarkedFiles.get(originalPath);
		if (!metadata) {
			throw new Error("Bookmark not found");
		}

		const nameError = validateFileName(newNameRaw);
		if (nameError) {
			throw new Error(nameError);
		}

		// 1) 메타데이터 이름 중복 처리
		const existsOther = Array.from(bookmarkedFiles.values()).some(
			m => m.originalPath !== originalPath && m.bookmarkName === newNameRaw
		);
		const finalMetaName = existsOther ? generateUniqueBookmarkName(newNameRaw) : newNameRaw;

		// 2) 실제 파일/폴더 rename 준비
		const dir = path.dirname(metadata.originalPath);
		const desiredFsName = preserveExt(metadata.originalPath, newNameRaw, metadata.isFile);
		const uniqueFsName = await generateUniqueFsName(dir, desiredFsName);
		const newOriginalPath = path.join(dir, uniqueFsName);

		// 3) 파일시스템 rename
		try {
			console.debug("[Simple-Bookmark.sync.rename.fs] from:", metadata.originalPath, "to:", newOriginalPath);
			await vscode.workspace.fs.rename(vscode.Uri.file(metadata.originalPath), vscode.Uri.file(newOriginalPath), { overwrite: false });
		} catch (e) {
			throw new Error(`Failed to rename original item: ${e}`);
		}

		// 4) 메타데이터 파일 rename(이름 변경 반영)
		const oldMetaPath = path.join(bookmarkPath, `${metadata.bookmarkName}${METADATA_EXT}`);
		const newMetaPath = path.join(bookmarkPath, `${finalMetaName}${METADATA_EXT}`);

		metadata.bookmarkName = finalMetaName;
		metadata.originalPath = newOriginalPath;
		metadata.lastSyncAt = Date.now();

		await saveMetadata(newMetaPath, metadata);
		try {
			await vscode.workspace.fs.delete(vscode.Uri.file(oldMetaPath));
		}
		catch { /* noop */ }

		// 5) 내부 맵과 워처 재바인딩
		bookmarkedFiles.delete(originalPath);
		bookmarkedFiles.set(newOriginalPath, metadata);
		disposeWatcherFor(originalPath);
		createWatcherFor(newOriginalPath);

		onSyncUpdate && onSyncUpdate(newOriginalPath, BookmarkStatus.SYNCED);
		onRefreshNeeded && onRefreshNeeded();
		console.debug("[Simple-Bookmark.sync.rename] meta:", finalMetaName, "path:", newOriginalPath);
	};

	// 북마크 제거 ------------------------------------------------------------------------
	const removeBookmark = async (originalPath: string): Promise<void> => {
		const metadata = bookmarkedFiles.get(originalPath);
		if (!metadata) {
			return;
		}

		try {
			const metadataPath = path.join(bookmarkPath, `${metadata.bookmarkName}${METADATA_EXT}`);
			await vscode.workspace.fs.delete(vscode.Uri.file(metadataPath));

			bookmarkedFiles.delete(originalPath);
			disposeWatcherFor(originalPath);

			onRefreshNeeded && onRefreshNeeded();
			console.debug("[Simple-Bookmark.sync.remove]", originalPath);
		}
		catch (error) {
			console.error(`Failed to remove bookmark: ${error}`);
		}
	};

	// 특정 북마크 동기화 ----------------------------------------------------------------
	const syncBookmark = async (originalPath: string): Promise<void> => {
		const metadata = bookmarkedFiles.get(originalPath);
		if (!metadata) {
			return;
		}

		try {
			await vscode.workspace.fs.stat(vscode.Uri.file(originalPath));

			metadata.lastSyncAt = Date.now();
			metadata.originalExists = true;

			const metadataPath = path.join(bookmarkPath, `${metadata.bookmarkName}${METADATA_EXT}`);
			await saveMetadata(metadataPath, metadata);

			onSyncUpdate && onSyncUpdate(originalPath, BookmarkStatus.SYNCED);
			onRefreshNeeded && onRefreshNeeded();
		}
		catch {
			metadata.originalExists = false;

			const metadataPath = path.join(bookmarkPath, `${metadata.bookmarkName}${METADATA_EXT}`);
			try {
				await saveMetadata(metadataPath, metadata);
			}
			catch { /* noop */ }

			onSyncUpdate && onSyncUpdate(originalPath, BookmarkStatus.MISSING);
		}
	};

	// 북마크 상태 갱신 ------------------------------------------------------------------
	const updateBookmarkStatus = async (originalPath: string, status: BookmarkStatus): Promise<void> => {
		onSyncUpdate && onSyncUpdate(originalPath, status);
		onRefreshNeeded && onRefreshNeeded();
	};

	// 북마크 상태 확인 (파일 존재 여부 검사) ---------------------------------------------
	const checkBookmarkStatus = async (metadata: BookmarkMetadata): Promise<BookmarkStatus> => {
		try {
			await vscode.workspace.fs.stat(vscode.Uri.file(metadata.originalPath));
			return BookmarkStatus.SYNCED;
		}
		catch {
			return BookmarkStatus.MISSING;
		}
	};

	// 북마크 여부 확인 ----------------------------------------------------------------
	const isBookmarkedFile = (filePath: string): boolean => bookmarkedFiles.has(filePath);

	// 메타데이터 조회 -----------------------------------------------------------------
	const getAllBookmarks = (): BookmarkMetadata[] => Array.from(bookmarkedFiles.values());
	const getBookmark = (originalPath: string): BookmarkMetadata | undefined => bookmarkedFiles.get(originalPath);

	// 원본 경로 변경 시 메타데이터 갱신 -----------------------------------------------
	const updateOriginalPath = async (oldPath: string, newPath: string): Promise<void> => {
		const metadata = bookmarkedFiles.get(oldPath);
		if (!metadata) {
			return;
		}
		bookmarkedFiles.delete(oldPath);
		disposeWatcherFor(oldPath);

		metadata.originalPath = newPath;

		const metadataPath = path.join(bookmarkPath, `${metadata.bookmarkName}${METADATA_EXT}`);
		await saveMetadata(metadataPath, metadata);

		bookmarkedFiles.set(newPath, metadata);
		createWatcherFor(newPath);

		onSyncUpdate && onSyncUpdate(newPath, BookmarkStatus.SYNCED);
		onRefreshNeeded && onRefreshNeeded();
	};

	// 메타데이터 저장 / 로드 ------------------------------------------------------
	const saveMetadata = async (metadataPath: string, metadata: BookmarkMetadata): Promise<void> => {
		const content = JSON.stringify(metadata, null, 2);
		await vscode.workspace.fs.writeFile(vscode.Uri.file(metadataPath), new TextEncoder().encode(content));
	};

	const loadMetadata = async (metadataPath: string): Promise<BookmarkMetadata | null> => {
		try {
			const content = await vscode.workspace.fs.readFile(vscode.Uri.file(metadataPath));
			return JSON.parse(content.toString()) as BookmarkMetadata;
		}
		catch {
			return null;
		}
	};

	// 리소스 정리 -------------------------------------------------------------------
	const dispose = (): void => {
		disposables.forEach(d => d.dispose());
		bookmarkWatchers.forEach(watcher => watcher.dispose());
		bookmarkWatchers.clear();
		bookmarkedFiles.clear();
	};

	// 초기화
	setupEventListeners();
	loadExistingBookmarks().catch(err => console.error(err));

	return {
		addBookmark,
		renameBookmark,
		removeBookmark,
		getAllBookmarks,
		getBookmark,
		updateOriginalPath,
		dispose
	};
};
