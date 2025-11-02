// providers/BookmarkProvider.ts

import { vscode, path } from "@importLibs";
import { BookmarkModel } from "@importModels";
import { BookmarkOperationService, BookmarkSyncService } from "@importServices";
import { fnNotification, fnGetBookmarkPath, fnLogging } from "@importScripts";
import { BookmarkStatus } from "@importTypes";
import type { BookmarkMetadata, BookmarkModelType } from "@importTypes";
import type { BookmarkOperationServiceType, BookmarkSyncServiceType } from "@importTypes";

// -------------------------------------------------------------------------------
export const BookmarkProvider = (
	workspaceRoot : string | undefined
) => {

	// 0. 변수 설정 ----------------------------------------------------------------------------
	let _onDidChangeTreeData = new vscode.EventEmitter<BookmarkModelType | undefined | null | void>();
	let onDidChangeTreeData = _onDidChangeTreeData.event;
	let bookmarkPath : string | undefined;
	let copiedBookmarks : vscode.Uri[] = [];
	let fileOperationService : BookmarkOperationServiceType | undefined;
	let syncService : BookmarkSyncServiceType | undefined;
	let bookmarkStatusMap : Map<string, BookmarkStatus> = new Map();
	let expandedDirPaths : Set<string> = new Set();
	let refreshTimer : NodeJS.Timeout | null = null;
		setTimeout(() => (
			initializeBookmarkFolder().catch(
				(err: any) => fnLogging(`activate`, `${err}`, `error`)
			), 0
		));

	// bookmark 폴더를 준비하고 서비스 초기화 -------------------------------------------------
	const initializeBookmarkFolder = async (): Promise<void> => {
		const hasRoot = !!workspaceRoot;

		return !hasRoot
		? void 0
		: await (async () => {
			bookmarkPath = fnGetBookmarkPath(workspaceRoot as string);

				try {
					await vscode.workspace.fs.stat(vscode.Uri.file(bookmarkPath));
				}
				catch {
					try {
						await vscode.workspace.fs.createDirectory(vscode.Uri.file(bookmarkPath));
						fnNotification(`create`, `${bookmarkPath}`, `info`);
					}
					catch (error) {
						fnNotification(`create`, `${error}`, `error`);
						return;
					}
				}

			bookmarkPath && (
				syncService = BookmarkSyncService(
					bookmarkPath, (
						p: string,
						status: BookmarkStatus
					) => {
						bookmarkStatusMap.set(p, status);
					},
					() => refresh()
				),
				fileOperationService = BookmarkOperationService(bookmarkPath, syncService)
			);
		})();
	};

	// 트리 갱신 이벤트를 디바운싱하여 갱신 ---------------------------------------------------
	const refresh = (
	): void => {
		refreshTimer && clearTimeout(refreshTimer);
		refreshTimer = setTimeout(() => _onDidChangeTreeData.fire(), 50);
	};

	// TreeItem을 그대로 반환 ----------------------------------------------------------------
	const getTreeItem = (
		element: BookmarkModelType
	): vscode.TreeItem => {
		return element;
	};

	// 자식 항목 가져오기 --------------------------------------------------------------
	// - 최상위: 실제 루트 북마크 목록만 반환(가짜 아이템 없음)
	// - 폴더 내부 탐색 시 순환(심볼릭 링크 등)으로 동일 경로가 반복적으로 나타나는 문제 방지
	// - 트리에서 루트 또는 자식 북마크 항목을 비동기로 생성하여 반환
	const getChildren = async (
		element? : BookmarkModelType
	) : Promise<BookmarkModelType[]> => {
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

	// 경로 비교를 위해 플랫폼별 정규화 ----------------------------------------------------------
	const normalizePath = (
		p: string
	): string => process.platform === "win32" ? p.toLowerCase() : p;

	// 디렉토리 우선, 이름 오름차순으로 정렬 ----------------------------------------------------
	const sortItems = (
		a: BookmarkModelType,
		b: BookmarkModelType
	): number => {
		const aIsDir = !a.bookmarkMetadata.isFile;
		const bIsDir = !b.bookmarkMetadata.isFile;
		return aIsDir === bIsDir
			? a.bookmarkMetadata.bookmarkName.localeCompare(b.bookmarkMetadata.bookmarkName)
			: aIsDir ? -1 : 1;
	};

	// 저장된 모든 루트 북마크를 불러와 TreeItem으로 변환 ---------------------------------------
	const getRootBookmarks = async (
	) : Promise<BookmarkModelType[]> => {
		!syncService && (void 0);

		const bookmarks = syncService!.getAllBookmarks();
		const items : BookmarkModelType[] = [];

		for (const metadata of bookmarks) {
			const status = bookmarkStatusMap.get(metadata.originalPath) ?? BookmarkStatus.SYNCED;
			const item = BookmarkModel(metadata, status);

			!metadata.isFile && (() => {
				const key = normalizePath(metadata.originalPath);
				item.collapsibleState = expandedDirPaths.has(key)
					? vscode.TreeItemCollapsibleState.Expanded
					: vscode.TreeItemCollapsibleState.Collapsed;
			})();

			items.push(item);
		}

		return items.sort(sortItems);
	};

	// 실제 폴더의 하위 항목 가져오기 ---------------------------------------------------
	const sortEntries = (
		a: [string, vscode.FileType],
		b: [string, vscode.FileType]
	): number => {
		const aIsDir = a[1] === vscode.FileType.Directory;
		const bIsDir = b[1] === vscode.FileType.Directory;
		return aIsDir === bIsDir ? a[0].localeCompare(b[0]) : aIsDir ? -1 : 1;
	};

	// 폴더의 하위 항목 가져오기 --------------------------------------------------------
	const getFolderContents = async (
		folderPath : string,
		ancestor? : Set<string>
	) : Promise<BookmarkModelType[]> => {
		try {
			const entries = await vscode.workspace.fs.readDirectory(vscode.Uri.file(folderPath));
			const items : BookmarkModelType[] = [];
			const sortedEntries = entries.sort(sortEntries);

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

				const sysItem = BookmarkModel(virtualMetadata, BookmarkStatus.SYNCED);

				!isFile && (() => {
					const key = normalizePath(itemPath);
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
			fnLogging(`select`, `${folderPath} ${error}`, `error`);
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
			? fnNotification(`activate`, "service not initialized.", `error`)
			: await (async () => {
				try {
					const finalBookmarkName = bookmarkName || path.basename(sourcePath);

					// 기존 동명 북마크 제거 후 생성
					const existing = syncService!.getAllBookmarks().filter(
						(b: BookmarkMetadata) => b.bookmarkName === finalBookmarkName
					);
					for (const meta of existing) {
						await syncService!.removeBookmark(meta.originalPath);
					}

					await syncService!.addBookmark(
						sourcePath,
						finalBookmarkName
					);
					fnNotification(`overwrite`, `${finalBookmarkName}`, `info`);
					fnLogging(`add`, `${sourcePath} -> ${finalBookmarkName}`, `debug`);
				}
				catch (error) {
					fnNotification(`add`, `${error}`, `error`);
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
		? fnNotification(`activate`, `service not initialized.`, `error`)
		: await (async () => {
			try {
				await syncService!.removeBookmark(originalPath);

				deleteOriginal && await (async () => {
					try {
						await vscode.workspace.fs.delete(
							vscode.Uri.file(originalPath),
							{recursive : true}
						);
						fnLogging(`remove`, `${originalPath}`, `debug`);
					}
					// 원본이 이미 없는 경우는 조용히 무시
					catch {
						fnLogging(`remove`, `${originalPath}`, `debug`);
					}
				})();
				fnLogging(`remove`, `${originalPath} ${deleteOriginal ? "with original" : "bookmark only"}`, `debug`);
			}
			catch (error) {
				fnNotification(`remove`, `${error}`, `error`);
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
		? fnNotification(`activate`, `service not initialized.`, `error`)
		: await (async () => {
			const meta = syncService!.getBookmark(originalPath);

			return meta
				? await (async () => {
					await syncService!.renameBookmark(
						originalPath,
						newName
					);
					fnLogging(`rename`, `${originalPath} -> ${newName}`, `debug`);
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
							// 동일한 원본 경로는 충돌로 간주하지 않음 (Windows 대소문자 처리 고려)
							while (true) {
								const candidatePath = path.join(dir, name);
								const resolvedCandidate = path.resolve(candidatePath);
								const resolvedOriginal = path.resolve(originalPath);
								if (resolvedCandidate === resolvedOriginal || (process.platform === "win32" && resolvedCandidate.toLowerCase() === resolvedOriginal.toLowerCase())) {
									return name;
								}
								try {
									await vscode.workspace.fs.stat(
										vscode.Uri.file(candidatePath)
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
						fnLogging(`rename`, `${originalPath} -> ${newPath}`, `debug`);
					}
					catch (error) {
						fnNotification(`rename`, `${error}`, `error`);
					}
				})();
		})();
	};

	// 복사 -----------------------------------------------------------------------------------
	// - 스냅샷 + 중복 제거
	const copyBookmarks = (
		items : BookmarkModelType[]
	) : void => {
		const dedup = new Map<string, vscode.Uri>();
		for (const it of items) {
			!dedup.has(it.originalPath) && dedup.set(
				it.originalPath,
				vscode.Uri.file(it.originalPath)
			);
		}
		copiedBookmarks = Array.from(dedup.values());
		copiedBookmarks.length === 1 ? (
			fnNotification(`copy`, `${path.basename(copiedBookmarks[0].fsPath)}`, `info`),
			fnLogging(`copy`, `${path.basename(copiedBookmarks[0].fsPath)}`, `debug`)
		) : (
			fnNotification(`copy`, `${copiedBookmarks.length}`, `info`),
			fnLogging(`copy`, `${copiedBookmarks.length}`, `debug`)
		);
	};

	// 붙여넣기 (대상 폴더에 덮어쓰기) ------------------------------------------------------
	const pasteItems = async (
		targetPath : string
	) : Promise<void> => {
		const ready = !!fileOperationService;

		return !ready
			? fnNotification(`activate`, "File operation service not initialized.", `error`)
			: await fileOperationService!.pasteItems(
				copiedBookmarks,
				targetPath
			);
	};

	// 루트 붙여넣기: 파일명 매칭 → 각 북마크의 실제 경로에 덮어쓰기 -------------------------
	const pasteItemsToRoot = async () : Promise<void> => {
		const ready = !!fileOperationService && !!syncService;

		return !ready
		? fnNotification(`activate`, "File operation service not initialized.", `error`)
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
					"[simple-bookmark] No root file bookmarks to overwrite."
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
			? fnNotification(`activate`, "File operation service not initialized.", `error`)
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
			? fnNotification(`activate`, "File operation service not initialized.", `error`)
		: await fileOperationService!.createFile(
			parentPath,
			fileName
		);
	};

	// Getter 및 상태 확인 --------------------------------------------------------------
	const rootPath = () : string | undefined => bookmarkPath;
	const hasCopiedItems = () : boolean => copiedBookmarks.length > 0;
	const dispose = () : void => syncService && syncService.dispose();
	const getBookmarkStatus = (
		originalPath : string
	) : BookmarkStatus => bookmarkStatusMap.get(originalPath) || BookmarkStatus.SYNCED;
	const isRootBookmark = (
		originalPath : string
	) : boolean => !!syncService?.getBookmark(originalPath);

	// 99. return -----------------------------------------------------------------------------
	return {
		onDidChangeTreeData,
		getTreeItem,
		getChildren,
		refresh,
		hasCopiedItems,
		getBookmarkStatus,
		isRootBookmark,
		dispose,
		addBookmark,
		removeBookmark,
		renameBookmark,
		copyBookmarks,
		pasteItems,
		pasteItemsToRoot,
		createFolder,
		createFile,
		markExpanded(path : string) {
			const key = normalizePath(path);
			expandedDirPaths.add(key);
		},
		markCollapsed(path : string) {
			const key = normalizePath(path);
			expandedDirPaths.delete(key);
		},
		get rootPath() {
			return rootPath();
		},
	};
};
