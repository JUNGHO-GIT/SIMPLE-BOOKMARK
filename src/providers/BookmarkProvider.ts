// providers/BookmarkProvider.ts

import * as vscode from "vscode";
import * as path from "path";
import {createBookmarkSystemItem, type BookmarkSystemItem} from "../models/BookmarkSystemItem.js";
import {createBookmarkOperationService, type BookmarkOperationService} from "../services/BookmarkOperationService.js";
import {createBookmarkSyncService, type BookmarkSyncService} from "../services/BookmarkSyncService.js";
import {getBookmarkPath} from "../utils/BookmarkPathUtil.js";
import {BookmarkStatus} from "../types/BookmarkType.js";
import {showInfoAuto, showErrorAuto} from "../utils/NotificationUtil.js";

// -------------------------------------------------------------------------------
export type BookmarkProvider = ReturnType<typeof createBookmarkProvider>;

// -------------------------------------------------------------------------------
export const createBookmarkProvider = (
	workspaceRoot : string | undefined
) => {
	const _onDidChangeTreeData = new vscode.EventEmitter<
		BookmarkSystemItem | undefined | null | void
	>();
	const onDidChangeTreeData = _onDidChangeTreeData.event;

	let bookmarkPath : string | undefined;
	let copiedBookmarks : vscode.Uri[] = [];
	let fileOperationService : BookmarkOperationService | undefined;
	let syncService : BookmarkSyncService | undefined;
	const bookmarkStatusMap : Map<string, BookmarkStatus> = new Map();
	const expandedDirPaths : Set<string> = new Set();
	const statusCache = new Map<string, {status: BookmarkStatus; timestamp: number}>();
	const STATUS_CACHE_TTL = 5000;

	// refresh 디바운스 최적화 - 더 빠른 응답성을 위해 감소 ----------------------------------
	let refreshTimer : NodeJS.Timeout | null = null;
	const refreshDebounceMs = 50;

	setTimeout(
		() => fnInitializeBookmarkFolder().catch(
			(err: any) => console.error(err)
		),
		0
	);

	// -----------------------------------------------------------------------------------------
	const fnInitializeBookmarkFolder = async (): Promise<void> => {
		const hasRoot = !!workspaceRoot;

		return !hasRoot
		? void 0
		: await (async () => {
			bookmarkPath = getBookmarkPath(workspaceRoot as string);

			try {
				await vscode.workspace.fs.stat(vscode.Uri.file(bookmarkPath));
			}
			catch {
				try {
					await vscode.workspace.fs.createDirectory(vscode.Uri.file(bookmarkPath));
					showInfoAuto(`[Simple-Bookmark] Folder created: ${bookmarkPath}`);
				}
				catch (error) {
					showErrorAuto(`[Simple-Bookmark] Failed to create folder: ${error}`);
					return;
				}
			}

			bookmarkPath && (
				syncService = createBookmarkSyncService(
					bookmarkPath,
					(p: string, status: BookmarkStatus) => {
						bookmarkStatusMap.set(p, status);
					},
					() => refresh()
				),
				fileOperationService = createBookmarkOperationService(bookmarkPath, syncService)
			);
		})();
	};

	// -----------------------------------------------------------------------------------------
	const refresh = (): void => {
		refreshTimer && clearTimeout(refreshTimer);
		refreshTimer = setTimeout(() => _onDidChangeTreeData.fire(), refreshDebounceMs);
	};

	// -----------------------------------------------------------------------------------------
	const getTreeItem = (element: BookmarkSystemItem): vscode.TreeItem => element;

	// 자식 항목 가져오기 --------------------------------------------------------------
	// - 최상위: 실제 루트 북마크 목록만 반환(가짜 아이템 없음)
	// - 폴더 내부 탐색 시 순환(심볼릭 링크 등)으로 동일 경로가 반복적으로 나타나는 문제 방지
	const getChildren = async (
		element? : BookmarkSystemItem
	) : Promise<BookmarkSystemItem[]> => {
		const ready = !!bookmarkPath && !!syncService;

		return !ready
		? []
		: !element
		? await getRootBookmarks()
		: await (async () => {
			const ancestor : Set<string> | undefined = (element as any)._ancestorPaths;
			const isCycle = !!ancestor && ancestor.has(element.originalPath);

						return isCycle
							? []
							: (!element.bookmarkMetadata.isFile)
								? await getFolderContents(
									element.originalPath,
									ancestor
								)
								: [];
		})();
	};

	// -----------------------------------------------------------------------------------------
	const fnNormalizePath = (p: string): string => process.platform === "win32" ? p.toLowerCase() : p;

	const fnSortItems = (a: BookmarkSystemItem, b: BookmarkSystemItem): number => {
		const aIsDir = !a.bookmarkMetadata.isFile;
		const bIsDir = !b.bookmarkMetadata.isFile;
		return aIsDir === bIsDir
			? a.bookmarkMetadata.bookmarkName.localeCompare(b.bookmarkMetadata.bookmarkName)
			: aIsDir ? -1 : 1;
	};

	const getRootBookmarks = async () : Promise<BookmarkSystemItem[]> => {
		!syncService && (void 0);

		const bookmarks = syncService!.getAllBookmarks();
		const items : BookmarkSystemItem[] = [];

		for (const metadata of bookmarks) {
			const status = bookmarkStatusMap.get(metadata.originalPath) ?? BookmarkStatus.SYNCED;
			const item = createBookmarkSystemItem(metadata, status);

			!metadata.isFile && (() => {
				const key = fnNormalizePath(metadata.originalPath);
				item.collapsibleState = expandedDirPaths.has(key)
					? vscode.TreeItemCollapsibleState.Expanded
					: vscode.TreeItemCollapsibleState.Collapsed;
			})();

			items.push(item);
		}

		return items.sort(fnSortItems);
	};

	// 실제 폴더의 하위 항목 가져오기 ---------------------------------------------------
	const fnSortEntries = (a: [string, vscode.FileType], b: [string, vscode.FileType]): number => {
		const aIsDir = a[1] === vscode.FileType.Directory;
		const bIsDir = b[1] === vscode.FileType.Directory;
		return aIsDir === bIsDir ? a[0].localeCompare(b[0]) : aIsDir ? -1 : 1;
	};

	const getFolderContents = async (
		folderPath : string,
		ancestor? : Set<string>
	) : Promise<BookmarkSystemItem[]> => {
		try {
			const entries = await vscode.workspace.fs.readDirectory(vscode.Uri.file(folderPath));
			const items : BookmarkSystemItem[] = [];
			const sortedEntries = entries.sort(fnSortEntries);

			for (const [name, type] of sortedEntries) {
				const itemPath = path.join(folderPath, name);
				const skip = ancestor?.has(itemPath);
				skip && (void 0);

				const isFile = type === vscode.FileType.File;
				const virtualMetadata = {
					originalPath : itemPath,
					bookmarkName : name,
					isFile,
					createdAt : Date.now(),
					lastSyncAt : Date.now(),
					originalExists : true
				};

				const sysItem = createBookmarkSystemItem(virtualMetadata, BookmarkStatus.SYNCED);

				!isFile && (() => {
					const key = fnNormalizePath(itemPath);
					sysItem.collapsibleState = expandedDirPaths.has(key)
						? vscode.TreeItemCollapsibleState.Expanded
						: vscode.TreeItemCollapsibleState.Collapsed;

					const chain = new Set<string>(ancestor ?? []);
					chain.add(folderPath);
					(sysItem as any)._ancestorPaths = chain;
				})();

				items.push(sysItem);
			}

			return items;
		}
		catch (error) {
			console.error(`Error reading folder contents: ${folderPath}`, error);
			return [];
		}
	};

	// 북마크 추가 --------------------------------------------------------------------
	const addBookmark = async (
		sourcePath : string,
		bookmarkName? : string
	) : Promise<void> => {
		const ready = !!syncService;

		return !ready
			? showErrorAuto("[Simple-Bookmark] Sync service not initialized.")
			: await (async () => {
				try {
					const finalBookmarkName = bookmarkName || path.basename(sourcePath);

					// 기존 동명 북마크 제거 후 생성
					const existing = syncService!.getAllBookmarks().filter(
						(b) => b.bookmarkName === finalBookmarkName
					);
					for (const meta of existing) {
						await syncService!.removeBookmark(meta.originalPath);
					}

					await syncService!.addBookmark(
						sourcePath,
						finalBookmarkName
					);
					showInfoAuto(
						`[Simple-Bookmark] Bookmark overwritten: ${finalBookmarkName}`
					);
					console.debug(
						"[Simple-Bookmark.provider.add]",
						sourcePath,
						"->",
						finalBookmarkName
					);
				}
				catch (error) {
					showErrorAuto(
						`[Simple-Bookmark] Failed to add bookmark: ${error}`
					);
				}
			})();
	};

	// 북마크 제거 (원본 파일/폴더 삭제 여부 선택 가능) ------------------------------------------
	const removeBookmark = async (
		originalPath : string,
		deleteOriginal : boolean = false
	) : Promise<void> => {
		const ready = !!syncService;

		return !ready
		? showErrorAuto("[Simple-Bookmark] Sync service not initialized.")
		: await (async () => {
			try {
				await syncService!.removeBookmark(originalPath);

				deleteOriginal && await (async () => {
					try {
						await vscode.workspace.fs.delete(
							vscode.Uri.file(originalPath),
							{recursive : true}
						);
						console.debug(
							"[Simple-Bookmark.provider.remove.originalDeleted]",
							originalPath
						);
					}
					catch {
						// 원본이 이미 없는 경우는 조용히 무시
						console.debug(
							"[Simple-Bookmark.provider.remove.originalMissing]",
							originalPath
						);
					}
				})();

				console.debug(
					"[Simple-Bookmark.provider.remove]",
					originalPath,
					deleteOriginal ? "(with original)" : "(bookmark only)"
				);
			}
			catch (error) {
				showErrorAuto(
					`[Simple-Bookmark] Failed to remove bookmark: ${error}`
				);
			}
		})();
	};

	// 북마크 이름 변경 ----------------------------------------------------------------
	// - 루트 북마크: syncService 통해 메타데이터+원본 rename
	// - 비루트(가상 항목): 파일시스템 직접 rename
	const renameBookmark = async (
		originalPath : string,
		newName : string
	) : Promise<void> => {
		const ready = !!syncService;

		return !ready
		? showErrorAuto("[Simple-Bookmark] Sync service not initialized.")
		: await (async () => {
			const meta = syncService!.getBookmark(originalPath);

			return meta
				? await (async () => {
					await syncService!.renameBookmark(
						originalPath,
						newName
					);
					console.debug(
						"[Simple-Bookmark.provider.rename.root]",
						originalPath,
						"->",
						newName
					);
				})()
				: await (async () => {
					try {
						const uri = vscode.Uri.file(originalPath);
						const stat = await vscode.workspace.fs.stat(uri);
						const dir = path.dirname(originalPath);

						// 확장자 보존
						const hasDot = newName.includes(".");
						const ext = stat.type === vscode.FileType.File ? path.extname(originalPath) : "";
						const baseCandidate = stat.type === vscode.FileType.File && !hasDot
							? `${newName}${ext}`
							: newName;

						// 충돌 회피용 유니크 이름 생성
						const mkUnique = async (
							candidate : string
						) : Promise<string> => {
							let name = candidate;
							let i = 1;
							while (true) {
								try {
									await vscode.workspace.fs.stat(
										vscode.Uri.file(path.join(dir, name))
									);
									const e = path.extname(candidate);
									const stem = path.basename(candidate, e);
									name = `${stem}_${i}${e}`;
									i++;
								}
								catch {
									return name;
								}
							}
						};

						const finalName = await mkUnique(baseCandidate);
						const newPath = path.join(dir, finalName);

						await vscode.workspace.fs.rename(
							uri,
							vscode.Uri.file(newPath),
							{overwrite : false}
						);
						console.debug(
							"[Simple-Bookmark.provider.rename.child]",
							originalPath,
							"->",
							newPath
						);
					}
					catch (error) {
						showErrorAuto(
							`[Simple-Bookmark] Failed to rename item: ${error}`
						);
					}
				})();
		})();
	};

	// 복사 -----------------------------------------------------------------------------------
	const copyBookmarks = (
		items : BookmarkSystemItem[]
	) : void => {
		// 스냅샷 + 중복 제거
		const dedup = new Map<string, vscode.Uri>();
		for (const it of items) {
			!dedup.has(it.originalPath) && dedup.set(
				it.originalPath,
				vscode.Uri.file(it.originalPath)
			);
		}
		copiedBookmarks = Array.from(dedup.values());

		const message = copiedBookmarks.length === 1
			? `[Simple-Bookmark] Copied: ${path.basename(copiedBookmarks[0].fsPath)}`
			: `[Simple-Bookmark] Copied ${copiedBookmarks.length} items`;
		vscode.window.showInformationMessage(message);
		console.debug(
			"[Simple-Bookmark.provider.copy.len]",
			copiedBookmarks.length
		);
	};

	// 붙여넣기 (대상 폴더에 덮어쓰기) ---------------------------------------------------
	const pasteItems = async (
		targetPath : string
	) : Promise<void> => {
		const ready = !!fileOperationService;

		return !ready
			? showErrorAuto("[Simple-Bookmark] File operation service not initialized.")
			: await fileOperationService!.pasteItems(
				copiedBookmarks,
				targetPath
			);
	};

	// 루트 붙여넣기: 파일명 매칭 → 각 북마크의 실제 경로에 덮어쓰기 -------------------
	const pasteItemsToRoot = async () : Promise<void> => {
		const ready = !!fileOperationService && !!syncService;

		return !ready
		? showErrorAuto("[Simple-Bookmark] File operation service not initialized.")
		: await (async () => {
			const all = syncService!.getAllBookmarks();

			const nameToOriginalPath = new Map<string, string>();
			for (const m of all) {
				m.isFile && nameToOriginalPath.set(
					m.bookmarkName,
					m.originalPath
				);
			}

			return nameToOriginalPath.size === 0
				? void vscode.window.showWarningMessage(
					"[Simple-Bookmark] No root file bookmarks to overwrite."
				)
				: await fileOperationService!.pasteItemsToRoot(
					copiedBookmarks,
					nameToOriginalPath
				);
		})();
	};

	// 폴더 생성 ---------------------------------------------------------------------------------
	const createFolder = async (
		parentPath : string,
		folderName : string
	) : Promise<void> => {
		const ready = !!fileOperationService;

		return !ready
		? showErrorAuto("[Simple-Bookmark] File operation service not initialized.")
		: await fileOperationService!.createFolder(
			parentPath,
			folderName
		);
	};

	// 파일 생성 ---------------------------------------------------------------------------------
	const createFile = async (
		parentPath : string,
		fileName : string
	) : Promise<void> => {
		const ready = !!fileOperationService;

		return !ready
		? showErrorAuto("[Simple-Bookmark] File operation service not initialized.")
		: await fileOperationService!.createFile(
			parentPath,
			fileName
		);
	};

	// Getter 및 상태 확인 --------------------------------------------------------------
	const rootPath = (
	) : string | undefined => bookmarkPath;
	const hasCopiedItems = (
	) : boolean => copiedBookmarks.length > 0;
	const getBookmarkStatus = (
		originalPath : string
	) : BookmarkStatus => bookmarkStatusMap.get(originalPath) || BookmarkStatus.SYNCED;
	const isRootBookmark = (
		originalPath : string
	) : boolean => !!syncService?.getBookmark(originalPath);

	// 리소스 정리 --------------------------------------------------------------------
	const dispose = () : void => {
		syncService && syncService.dispose();
	};

	// 리턴 ----------------------------------------------------------------------------
	return {
		onDidChangeTreeData,
		getTreeItem,
		getChildren,
		refresh,
		markExpanded(path : string) {
			const key = fnNormalizePath(path);
			expandedDirPaths.add(key);
		},
		markCollapsed(path : string) {
			const key = fnNormalizePath(path);
			expandedDirPaths.delete(key);
		},
		addBookmark,
		removeBookmark,
		renameBookmark,
		copyBookmarks,
		pasteItems,
		pasteItemsToRoot,
		createFolder,
		createFile,
		get rootPath() {
			return rootPath();
		},
		hasCopiedItems,
		getBookmarkStatus,
		isRootBookmark,
		dispose
	};
};
