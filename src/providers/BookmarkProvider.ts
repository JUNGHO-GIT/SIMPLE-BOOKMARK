// providers/BookmarkProvider.ts

import * as vscode from "vscode";
import * as path from "path";
import { createBookmarkSystemItem, type BookmarkSystemItem } from "../models/BookmarkSystemItem.js";
import { createBookmarkOperationService, type BookmarkOperationService } from "../services/BookmarkOperationService.js";
import { createBookmarkSyncService, type BookmarkSyncService } from "../services/BookmarkSyncService.js";
import { getBookmarkPath } from "../utils/BookmarkPathUtil.js";
import { BookmarkStatus } from "../types/BookmarkTypes.js";

// -------------------------------------------------------------------------------
export type BookmarkProvider = ReturnType<typeof createBookmarkProvider>;

export const createBookmarkProvider = (workspaceRoot: string | undefined) => {
	const _onDidChangeTreeData = new vscode.EventEmitter<BookmarkSystemItem | undefined | null | void>();
	const onDidChangeTreeData = _onDidChangeTreeData.event;

	let bookmarkPath: string | undefined;
	let copiedBookmarks: vscode.Uri[] = [];
	let fileOperationService: BookmarkOperationService | undefined;
	let syncService: BookmarkSyncService | undefined;
	const bookmarkStatusMap: Map<string, BookmarkStatus> = new Map();

	// refresh 디바운스 -------------------------------------------------------------
	let refreshTimer: NodeJS.Timeout | null = null;
	const refreshDebounceMs = 150;

	setTimeout(() => initializeBookmarkFolder().catch(err => console.error(err)), 0);

	// .bookmark 폴더 초기화 ---------------------------------------------------------
	const initializeBookmarkFolder = async (): Promise<void> => {
		if (!workspaceRoot) {
			return;
		}

		bookmarkPath = getBookmarkPath(workspaceRoot);

		try {
			await vscode.workspace.fs.stat(vscode.Uri.file(bookmarkPath));
		}
		catch {
			try {
				await vscode.workspace.fs.createDirectory(vscode.Uri.file(bookmarkPath));
				vscode.window.showInformationMessage(`BOOKMARK folder created: ${bookmarkPath}`);
			}
			catch (error) {
				vscode.window.showErrorMessage(`Failed to create BOOKMARK folder: ${error}`);
				return;
			}
		}

		if (bookmarkPath) {
			syncService = createBookmarkSyncService(
				bookmarkPath,
				(p: string, status: BookmarkStatus) => {
					bookmarkStatusMap.set(p, status);
				},
				() => refresh()
			);

			fileOperationService = createBookmarkOperationService(
				bookmarkPath,
				syncService
			);
		}
	};

	// 트리 갱신(디바운스) --------------------------------------------------------------
	const refresh = (): void => {
		if (refreshTimer) clearTimeout(refreshTimer);
		refreshTimer = setTimeout(() => {
			_onDidChangeTreeData.fire();
		}, refreshDebounceMs);
	};

	// 트리 항목 반환 ------------------------------------------------------------------
	const getTreeItem = (element: BookmarkSystemItem): vscode.TreeItem => element;

	// 자식 항목 가져오기 --------------------------------------------------------------
	// - 최상위: 실제 루트 북마크 목록만 반환(가짜 아이템 없음)
	const getChildren = async (element?: BookmarkSystemItem): Promise<BookmarkSystemItem[]> => {
		if (!bookmarkPath || !syncService) {
			return [];
		}

		if (!element) {
			return getRootBookmarks();
		}

		if (!element.bookmarkMetadata.isFile && element.isOriginalAvailable) {
			return getFolderContents(element.originalPath);
		}

		return [];
	};

	// 루트 레벨 북마크 가져오기 ------------------------------------------------------
	const getRootBookmarks = async (): Promise<BookmarkSystemItem[]> => {
		if (!syncService) {
			return [];
		}

		const bookmarks = syncService.getAllBookmarks();
		const items: BookmarkSystemItem[] = [];

		for (const metadata of bookmarks) {
			const status = bookmarkStatusMap.get(metadata.originalPath) || BookmarkStatus.SYNCED;
			items.push(createBookmarkSystemItem(metadata, status));
		}

		return items.sort((a, b) => {
			const aIsDir = !a.bookmarkMetadata.isFile;
			const bIsDir = !b.bookmarkMetadata.isFile;

			if (aIsDir && !bIsDir) return -1;
			if (!aIsDir && bIsDir) return 1;
			return a.bookmarkMetadata.bookmarkName.localeCompare(b.bookmarkMetadata.bookmarkName);
		});
	};

	// 실제 폴더의 하위 항목 가져오기 ---------------------------------------------------
	const getFolderContents = async (folderPath: string): Promise<BookmarkSystemItem[]> => {
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

				items.push(createBookmarkSystemItem(virtualMetadata, BookmarkStatus.SYNCED));
			}

			return items;
		}
		catch (error) {
			console.error(`Error reading folder contents: ${folderPath}`, error);
			return [];
		}
	};

	// 북마크 추가 --------------------------------------------------------------------
	const addBookmark = async (sourcePath: string, bookmarkName?: string): Promise<void> => {
		if (!syncService) {
			vscode.window.showErrorMessage("Bookmark sync service not initialized.");
			return;
		}

		try {
			const finalBookmarkName = bookmarkName || path.basename(sourcePath);

			// 기존 동명 북마크 제거 후 생성
			const existing = syncService.getAllBookmarks().filter(b => b.bookmarkName === finalBookmarkName);
			for (const meta of existing) {
				await syncService.removeBookmark(meta.originalPath);
			}

			await syncService.addBookmark(sourcePath, finalBookmarkName);
			vscode.window.showInformationMessage(`Bookmark overwritten: ${finalBookmarkName}`);
			console.debug("[SIMPLE-BOOKMARK.provider.add]", sourcePath, "->", finalBookmarkName);
		}
		catch (error) {
			vscode.window.showErrorMessage(`Failed to add bookmark: ${error}`);
		}
	};

	// 북마크 제거 (원본 파일은 유지) -------------------------------------------------
	const removeBookmark = async (originalPath: string): Promise<void> => {
		if (!syncService) {
			vscode.window.showErrorMessage("Bookmark sync service not initialized.");
			return;
		}

		try {
			await syncService.removeBookmark(originalPath);
			console.debug("[SIMPLE-BOOKMARK.provider.remove]", originalPath);
		}
		catch (error) {
			vscode.window.showErrorMessage(`Failed to remove bookmark: ${error}`);
		}
	};

	// 북마크 이름 변경 ----------------------------------------------------------------
	// - 루트 북마크: syncService 통해 메타데이터+원본 rename
	// - 비루트(가상 항목): 파일시스템 직접 rename
	const renameBookmark = async (originalPath: string, newName: string): Promise<void> => {
		if (!syncService) {
			vscode.window.showErrorMessage("Bookmark sync service not initialized.");
			return;
		}

		const meta = syncService.getBookmark(originalPath);
		if (meta) {
			// 루트 북마크
			await syncService.renameBookmark(originalPath, newName);
			console.debug("[SIMPLE-BOOKMARK.provider.rename.root]", originalPath, "->", newName);
			return;
		}

		// 비루트: 파일시스템 rename
		try {
			const uri = vscode.Uri.file(originalPath);
			const stat = await vscode.workspace.fs.stat(uri);
			const dir = path.dirname(originalPath);

			// 확장자 보존
			const hasDot = newName.includes(".");
			const ext = stat.type === vscode.FileType.File ? path.extname(originalPath) : "";
			const baseCandidate = (stat.type === vscode.FileType.File && !hasDot) ? `${newName}${ext}` : newName;

			// 충돌 회피용 유니크 이름 생성
			const mkUnique = async (candidate: string): Promise<string> => {
				let name = candidate;
				let i = 1;
				while (true) {
					try {
						await vscode.workspace.fs.stat(vscode.Uri.file(path.join(dir, name)));
						const e = path.extname(candidate);
						const stem = path.basename(candidate, e);
						name = `${stem}_${i}${e}`;
						i++;
					} catch {
						return name;
					}
				}
			};

			const finalName = await mkUnique(baseCandidate);
			const newPath = path.join(dir, finalName);

			await vscode.workspace.fs.rename(uri, vscode.Uri.file(newPath), { overwrite: false });
			console.debug("[SIMPLE-BOOKMARK.provider.rename.child]", originalPath, "->", newPath);
		}
		catch (error) {
			vscode.window.showErrorMessage(`Failed to rename item: ${error}`);
		}
	};

	// 복사 / 붙여넣기 ---------------------------------------------------------------
	const copyBookmarks = (items: BookmarkSystemItem[]): void => {
		// 스냅샷 + 중복 제거
		const dedup = new Map<string, vscode.Uri>();
		for (const it of items) {
			if (!dedup.has(it.originalPath)) {
				dedup.set(it.originalPath, vscode.Uri.file(it.originalPath));
			}
		}
		copiedBookmarks = Array.from(dedup.values());

		const message = copiedBookmarks.length === 1
			? `Copied: ${path.basename(copiedBookmarks[0].fsPath)}`
			: `Copied ${copiedBookmarks.length} items`;
		vscode.window.showInformationMessage(message);
		console.debug("[SIMPLE-BOOKMARK.provider.copy.len]", copiedBookmarks.length);
	};

	const pasteItems = async (targetPath: string): Promise<void> => {
		if (!fileOperationService) {
			vscode.window.showErrorMessage("File operation service not initialized.");
			return;
		}
		await fileOperationService.pasteItems(copiedBookmarks, targetPath);
	};

	// 루트 붙여넣기: 파일명 매칭 → 각 북마크의 실제 경로에 덮어쓰기 -------------------
	const pasteItemsToRoot = async (): Promise<void> => {
		if (!fileOperationService || !syncService) {
			vscode.window.showErrorMessage("File operation service not initialized.");
			return;
		}
		const all = syncService.getAllBookmarks();

		const nameToOriginalPath = new Map<string, string>();
		for (const m of all) {
			m.isFile && nameToOriginalPath.set(m.bookmarkName, m.originalPath);
		}

		if (nameToOriginalPath.size === 0) {
			vscode.window.showWarningMessage("No root file bookmarks to overwrite.");
			return;
		}

		await fileOperationService.pasteItemsToRoot(copiedBookmarks, nameToOriginalPath);
	};

	// 파일/폴더 생성 ------------------------------------------------------------------
	const createFolder = async (parentPath: string, folderName: string): Promise<void> => {
		if (!fileOperationService) {
			vscode.window.showErrorMessage("File operation service not initialized.");
			return;
		}
		await fileOperationService.createFolder(parentPath, folderName);
	};

	const createFile = async (parentPath: string, fileName: string): Promise<void> => {
		if (!fileOperationService) {
			vscode.window.showErrorMessage("File operation service not initialized.");
			return;
		}
		await fileOperationService.createFile(parentPath, fileName);
	};

	// Getter 및 상태 확인 --------------------------------------------------------------
	const rootPath = (): string | undefined => bookmarkPath;

	const hasCopiedItems = (): boolean => copiedBookmarks.length > 0;

	const getBookmarkStatus = (originalPath: string): BookmarkStatus =>
		bookmarkStatusMap.get(originalPath) || BookmarkStatus.SYNCED;

	const isRootBookmark = (originalPath: string): boolean =>
		!!syncService?.getBookmark(originalPath);

	// 리소스 정리 --------------------------------------------------------------------
	const dispose = (): void => {
		syncService && syncService.dispose();
	};

	return {
		// TreeDataProvider 인터페이스
		onDidChangeTreeData,
		getTreeItem,
		getChildren,

		// control
		refresh,

		// ops
		addBookmark,
		removeBookmark,
		renameBookmark,
		copyBookmarks,
		pasteItems,
		pasteItemsToRoot,
		createFolder,
		createFile,

		// state
		get rootPath() { return rootPath(); },
		hasCopiedItems,
		getBookmarkStatus,
		isRootBookmark,

		// lifecycle
		dispose
	};
};
