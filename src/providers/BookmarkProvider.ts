// providers/BookmarkProvider.ts

import { vscode, path } from "@exportLibs";
import { BookmarkModel } from "@exportModels";
import { BookmarkOperationService, BookmarkSyncService } from "@exportServices";
import { notify, getBookmarkPath, logging } from "@exportScripts";
import { BookmarkStatus } from "@exportTypes";
import type { BookmarkMetadata, BookmarkModelType } from "@exportTypes";
import type { BookmarkOperationServiceType, BookmarkSyncServiceType } from "@exportTypes";

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
			(err: any) => logging(`error`, `activate`, `${err}`)
		), 0
	));

	// bookmark 폴더를 준비하고 서비스 초기화 -------------------------------------------------
	const initializeBookmarkFolder = async (): Promise<void> => {
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
					notify(`info`, `create`, `${bookmarkPath}`);
				}
				catch (error) {
					notify(`error`, `create`, `${error}`);
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
				// 동일한 실제 경로가 트리의 여러 위치(루트 북마크/다른 폴더 하위)에서 동시에 노출될 수 있으므로
				// TreeItem.id 를 부모 경로를 포함한 고유 값으로 재정의하여 "요소가 이미 등록" 오류를 방지
				sysItem.id = `child:${folderPath}|${itemPath}`;

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
			logging(`error`, `select`, `${folderPath} ${error}`);
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
			? notify(`error`, `activate`, "Bookmark service is not initialized.")
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
					notify(`info`, `overwrite`, `${finalBookmarkName}`);
					logging(`debug`, `add`, `${sourcePath} -> ${finalBookmarkName}`);
				}
				catch (error) {
					notify(`error`, `add`, `${error}`);
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
			? notify(`error`, `activate`, `Bookmark service is not initialized.`)
		: await (async () => {
			try {
				await syncService!.removeBookmark(originalPath);

				deleteOriginal && await (async () => {
					try {
						await vscode.workspace.fs.delete(
							vscode.Uri.file(originalPath),
							{recursive : true}
						);
						logging(`debug`, `remove`, `${originalPath}`);
					}
					// 원본이 이미 없는 경우는 조용히 무시
					catch {
						logging(`debug`, `remove`, `${originalPath}`);
					}
				})();
				logging(`debug`, `remove`, `${originalPath} ${deleteOriginal ? "with original" : "bookmark only"}`);
			}
			catch (error) {
				notify(`error`, `remove`, `${error}`);
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
	? notify(`error`, `activate`, `Bookmark service is not initialized.`)
		: await (async () => {
			const meta = syncService!.getBookmark(originalPath);

			return meta
				? await (async () => {
					await syncService!.renameBookmark(
						originalPath,
						newName
					);
					logging(`debug`, `rename`, `${originalPath} -> ${newName}`);
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
						logging(`debug`, `rename`, `${originalPath} -> ${newPath}`);
					}
					catch (error) {
						notify(`error`, `rename`, `${error}`);
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
			notify(`info`, `copy`, `${path.basename(copiedBookmarks[0].fsPath)}`),
			logging(`debug`, `copy`, `${path.basename(copiedBookmarks[0].fsPath)}`)
		) : (
			notify(`info`, `copy`, `${copiedBookmarks.length}`),
			logging(`debug`, `copy`, `${copiedBookmarks.length}`)
		);
	};

	// 붙여넣기 (대상 폴더에 덮어쓰기) ------------------------------------------------------
	const pasteItems = async (
		targetPath : string
	) : Promise<void> => {
		const ready = !!fileOperationService;

		return !ready
			? notify(`error`, `activate`, "File operation service is not initialized.")
			: await fileOperationService!.pasteItems(
				copiedBookmarks,
				targetPath
			);
	};

	// 폴더 내 모든 파일 경로를 재귀적으로 수집 --------------------------------------------
	const collectFilesFromFolder = async (
		folderPath : string,
		visited : Set<string> = new Set()
	) : Promise<string[]> => {
		const files : string[] = [];
		const normalizedPath = path.resolve(folderPath);

		// 순환 참조 방지 (심볼릭 링크 등)
		return visited.has(normalizedPath)
		? files
		: await (async () => {
			try {
				visited.add(normalizedPath);
				const entries = await vscode.workspace.fs.readDirectory(vscode.Uri.file(folderPath));
				for (const [name, type] of entries) {
					const itemPath = path.join(folderPath, name);
					type === vscode.FileType.File
					? files.push(itemPath)
					: type === vscode.FileType.Directory && await (async () => {
						const subFiles = await collectFilesFromFolder(itemPath, visited);
						files.push(...subFiles);
					})();
				}
			}
			catch (error) {
				logging(`debug`, `paste`, `failed to collect files from ${folderPath} ${error}`);
			}
			return files;
		})();
	};

	// 루트 붙여넣기: 파일명 매칭 → 각 북마크의 실제 경로에 덮어쓰기 -------------------------
	const pasteItemsToRoot = async () : Promise<void> => {
		const ready = !!fileOperationService && !!syncService;

	return !ready
	? notify(`error`, `activate`, "File operation service is not initialized.")
		: await (async () => {
			const all = syncService!.getAllBookmarks();

			// 모든 북마크(파일 및 폴더 내 파일)를 파일명으로 매핑
			// 참고: 동일 파일명이 여러 곳에 있을 경우 마지막 것이 사용됨
			const nameToOriginalPath = new Map<string, string>();
			for (const m of all) {
				m.isFile
				? nameToOriginalPath.set(m.bookmarkName, m.originalPath)
				: await (async () => {
					const folderFiles = await collectFilesFromFolder(m.originalPath);
					for (const filePath of folderFiles) {
						const fileName = path.basename(filePath);
						nameToOriginalPath.set(fileName, filePath);
					}
				})();
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

		return !ready ? notify(`error`, `activate`, "File operation service is not initialized.")
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

		return !ready ? notify(`error`, `activate`, "File operation service is not initialized.")
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