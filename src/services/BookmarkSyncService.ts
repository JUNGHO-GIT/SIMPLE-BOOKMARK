// services/BookmarkSyncService.ts

import { vscode, path, TextEncoder } from "@exportLibs";
import type { BookmarkMetadata } from "@exportTypes";
import { BookmarkStatus } from "@exportTypes";
import { validateFileName, logger } from "@exportScripts";

// -----------------------------------------------------------------------------------------
export const BookmarkSyncService = (
	bookmarkPath : string,
	onSyncUpdate? : (p : string, status : BookmarkStatus) => void,
	onRefreshNeeded? : () => void
) => {

	// 0. 변수 설정 ----------------------------------------------------------------------------
	const bookmarkWatchers = new Map<string, vscode.FileSystemWatcher>();
	const bookmarkedFiles = new Map<string, BookmarkMetadata>();
	const METADATA_EXT = `.bookmark.json`;
	const disposables : vscode.Disposable[] = [];

	// 파일/폴더 존재 여부를 확인 ---------------------------------------------------------------
	const fileExists = async (
		p: string
	): Promise<boolean> => {
		try {
			await vscode.workspace.fs.stat(vscode.Uri.file(p));
			return true;
		}
		catch {
			return false;
		}
	};

	// 파일의 확장자를 보존하여 새 이름을 생성 ------------------------------------------------
	const preserveExt = (
		originalPath: string,
		newNameRaw: string,
		isFile: boolean
	): string => {
		const ext = path.extname(originalPath);
		return isFile && !newNameRaw.includes(".") && ext ? `${newNameRaw}${ext}` : newNameRaw;
	};

	// 고유 파일/폴더명을 생성 -----------------------------------------------------------------
	const generateUniqueFsName = async (
		dir: string,
		baseName: string
	): Promise<string> => {
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
	// - 글로벌 워처 제거
	// - 북마크별 워처만 등록
	// - 문서 저장/변경/삭제 이벤트를 구독하여 북마크 상태를 갱신
	const setupEventListeners = (
	) : void => {
		const saveListener = vscode.workspace.onDidSaveTextDocument(async (document) => {
			const filePath = document.uri.fsPath;
			!isBookmarkedFile(filePath) || (
				logger(`debug`, `save - ${filePath}`),
				await syncBookmark(filePath)
			);
		});
		disposables.push(saveListener);
	};

	// 파일별 워처 생성 --------------------------------------------------------------------
	// 특정 원본 경로에 대한 파일시스템 워처를 생성
	const createWatcherFor = (
		originalPath : string
	) : void => {
		bookmarkWatchers.has(originalPath) || (() => {
			const pattern = new vscode.RelativePattern(
				path.dirname(originalPath),
				path.basename(originalPath)
			);
			const watcher = vscode.workspace.createFileSystemWatcher(pattern, false, false, false);

			watcher.onDidChange(async (uri) => {
				uri.fsPath === originalPath && (
					logger(`debug`, `save - ${originalPath}`),
					await syncBookmark(originalPath)
				);
			});
			watcher.onDidCreate(async (uri) => {
				uri.fsPath === originalPath && await updateBookmarkStatus(originalPath, BookmarkStatus.SYNCED);
			});
			watcher.onDidDelete(async (uri) => {
				uri.fsPath === originalPath && await updateBookmarkStatus(originalPath, BookmarkStatus.MISSING);
			});

			bookmarkWatchers.set(originalPath, watcher);
		})();
	};

	// 특정 원본 경로의 파일시스템 워처를 해제 -----------------------------------------------------
	const disposeWatcherFor = (
		originalPath : string
	) : void => {
 		const w = bookmarkWatchers.get(originalPath);
 		w && (w.dispose(), bookmarkWatchers.delete(originalPath));
	};

	// 병렬 처리 및 배치 상태 업데이트 -------------------------------------------------------------
	const loadExistingBookmarks = async () : Promise<void> => {
		try {
			const entries = await vscode.workspace.fs.readDirectory(vscode.Uri.file(bookmarkPath));
			const metaPaths = entries
			.filter(([name]) => name.endsWith(METADATA_EXT))
			.map(([name]) => path.join(bookmarkPath, name));

			// 병렬로 메타데이터 로딩 - 최대 10개씩 배치 처리
			const BATCH_SIZE = 10;
			const loadedMetadata: BookmarkMetadata[] = [];

			for (let i = 0; i < metaPaths.length; i += BATCH_SIZE) {
				const batch = metaPaths.slice(i, i + BATCH_SIZE);
				const batchPromises = batch.map(async (metadataPath) => {
					try {
						const metadata = await loadMetadata(metadataPath);
						metadata && (bookmarkedFiles.set(metadata.originalPath, metadata), createWatcherFor(metadata.originalPath));
						return metadata;
					}
					catch (error) {
						logger(`error`, `activate - ${error instanceof Error ? error.message : String(error)}`);
						return null;
					}
				});
				const batchResults = await Promise.all(batchPromises);
				batchResults.forEach((meta) => meta && loadedMetadata.push(meta));
			}

			// 배치로 상태 확인 후 한 번에 갱신
			loadedMetadata.length > 0 && await (async () => {
				const statusPromises = loadedMetadata.map(async (metadata) => {
					const status = await checkBookmarkStatus(metadata);
					onSyncUpdate?.(metadata.originalPath, status);
					return status;
				});
				await Promise.all(statusPromises);
				onRefreshNeeded?.();
			})();
		}
		catch (error) {
			logger(`error`, `activate - ${error}`);
		}
	};

	// 북마크 추가 (메타데이터 생성 및 저장) ------------------------------------------------
	const addBookmark = async (
		originalPath : string,
		bookmarkName? : string
	) : Promise<void> => {
		try {
			const stat = await vscode.workspace.fs.stat(vscode.Uri.file(originalPath));

			const baseName = path.basename(originalPath);
			const finalBookmarkName = bookmarkName || baseName;
			const uniqueBookmarkName = generateUniqueBookmarkName(finalBookmarkName);

			const metadata : BookmarkMetadata = {
				originalPath : originalPath,
				bookmarkName : uniqueBookmarkName,
				isFile : stat.type === vscode.FileType.File,
				createdAt : Date.now(),
				lastSyncAt : Date.now(),
				originalExists : true,
			};

			const metadataPath = path.join(bookmarkPath, `${uniqueBookmarkName}${METADATA_EXT}`);
			await saveMetadata(metadataPath, metadata);

			bookmarkedFiles.set(originalPath, metadata);
			createWatcherFor(originalPath);

			onSyncUpdate && onSyncUpdate(originalPath, BookmarkStatus.SYNCED);
			onRefreshNeeded && onRefreshNeeded();
			logger(`debug`, `add - ${uniqueBookmarkName}`);
		}
		catch (error) {
			logger(`error`, `add - ${error instanceof Error ? error.message : String(error)}`);
		}
	};

	// 고유한 북마크 이름 생성 (중복 방지) -------------------------------------------------
	const generateUniqueBookmarkName = (
		bookmarkName : string
	) : string => {
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

	// 동일한 북마크 이름이 이미 존재하는지 확인 -------------------------------------------
	const isBookmarkNameExists = (
		name : string
	) : boolean => {
		return Array.from(bookmarkedFiles.values()).some((m) => m.bookmarkName === name);
	};

	// 북마크 이름 변경 --------------------------------------------------------------------
	// 북마크 이름 및 원본 파일/폴더 이름을 변경하고 메타데이터를 갱신
	const renameBookmark = async (
		originalPath : string,
		newNameRaw : string
	) : Promise<void> => {
		const metadata = bookmarkedFiles.get(originalPath);

		!metadata && (() => {
		})();

		const nameError = validateFileName(newNameRaw);
		nameError && (() => {
		})();

		// 메타데이터 이름 중복 처리
		const existsOther = Array.from(bookmarkedFiles.values()).some((m) => m.originalPath !== originalPath && m.bookmarkName === newNameRaw);
		const finalMetaName = existsOther ? generateUniqueBookmarkName(newNameRaw) : newNameRaw;

		// 실제 파일/폴더 rename 준비
		const dir = path.dirname(metadata!.originalPath);
		const desiredFsName = preserveExt(metadata!.originalPath, newNameRaw, metadata!.isFile);
		const candidateFsPath = path.join(dir, desiredFsName);

		// 대상 경로가 현재 경로와 동일하면 실제 파일시스템 rename은 생략
		let newOriginalPath = metadata!.originalPath;
		if (path.resolve(candidateFsPath) !== path.resolve(metadata!.originalPath)) {
			const uniqueFsName = await generateUniqueFsName(dir, desiredFsName);
			newOriginalPath = path.join(dir, uniqueFsName);

			// 파일시스템 rename
			try {
				logger(`debug`, `rename - ${metadata!.originalPath} -> ${newOriginalPath}`);
				await vscode.workspace.fs.rename(
					vscode.Uri.file(metadata!.originalPath),
					vscode.Uri.file(newOriginalPath),
					{overwrite : false}
				);
			}
			catch (error) {
				logger(`error`, `rename: ${error instanceof Error ? error.message : String(error)}`);
			}
	}
	else {
		logger(`debug`, `rename - ${metadata!.originalPath}`);
	}		// 메타데이터 파일 rename(이름 변경 반영)
		const oldMetaPath = path.join(bookmarkPath, `${metadata!.bookmarkName}${METADATA_EXT}`);
		const newMetaPath = path.join(bookmarkPath, `${finalMetaName}${METADATA_EXT}`);

		metadata!.bookmarkName = finalMetaName;
		metadata!.originalPath = newOriginalPath;
		metadata!.lastSyncAt = Date.now();

		// 메타데이터 파일명이 변경되지 않은 경우 기존 파일 삭제는 하지 않음
		await saveMetadata(newMetaPath, metadata!);
		oldMetaPath !== newMetaPath && await vscode.workspace.fs.delete(vscode.Uri.file(oldMetaPath));

		// 내부 맵과 워처 재바인딩
		if (path.resolve(originalPath) !== path.resolve(newOriginalPath)) {
			bookmarkedFiles.delete(originalPath);
			disposeWatcherFor(originalPath);
			bookmarkedFiles.set(newOriginalPath, metadata!);
			createWatcherFor(newOriginalPath);
		}
		// 경로가 동일하면 맵에 메타데이터만 갱신
		else {
			bookmarkedFiles.set(originalPath, metadata!);
		}

	onSyncUpdate && onSyncUpdate(newOriginalPath, BookmarkStatus.SYNCED);
	onRefreshNeeded && onRefreshNeeded();
	logger(`debug`, `rename - ${finalMetaName} / ${newOriginalPath}`);
};	// 북마크 제거 ------------------------------------------------------------------------
	// - 메타데이터 파일을 삭제하고 워처 및 내부 상태를 정리
	const removeBookmark = async (
		originalPath : string
	) : Promise<void> => {
		const metadata = bookmarkedFiles.get(originalPath);

		metadata && await (async () => {
			try {
				const metadataPath = path.join(bookmarkPath, `${metadata.bookmarkName}${METADATA_EXT}`);
				await vscode.workspace.fs.delete(vscode.Uri.file(metadataPath));
				bookmarkedFiles.delete(originalPath);
				disposeWatcherFor(originalPath);
				onRefreshNeeded && onRefreshNeeded();
				logger(`debug`, `remove: ${originalPath}`);
			}
			catch (error) {
				logger(`error`, `remove: ${error instanceof Error ? error.message : String(error)}`);
			}
		})();
	};

	// 특정 북마크 동기화 ----------------------------------------------------------------
	// 원본 파일 상태에 따라 메타데이터를 갱신하고 상태를 반영
	const syncBookmark = async (
		originalPath : string
	) : Promise<void> => {
		const metadata = bookmarkedFiles.get(originalPath);

		metadata && await (async () => {
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
				await saveMetadata(metadataPath, metadata);
				onSyncUpdate && onSyncUpdate(originalPath, BookmarkStatus.MISSING);
			}
		})();
	};

	// 북마크 상태 갱신 ------------------------------------------------------------------
	// - 외부에서 전달된 상태를 즉시 반영하고 새로고침 요청
	const updateBookmarkStatus = async (
		originalPath : string,
		status : BookmarkStatus
	) : Promise<void> => {
		onSyncUpdate && onSyncUpdate(originalPath, status);
		onRefreshNeeded && onRefreshNeeded();
	};

	// 북마크 상태 확인 ----------------------------------------------------------------
	// - 파일 존재 여부 검사
	const checkBookmarkStatus = async (
		metadata : BookmarkMetadata
	) : Promise<BookmarkStatus> => {
		try {
			await vscode.workspace.fs.stat(vscode.Uri.file(metadata.originalPath));
			return BookmarkStatus.SYNCED;
		}
		catch {
			return BookmarkStatus.MISSING;
		}
	};

	// 북마크 여부 확인 ----------------------------------------------------------------
	const isBookmarkedFile = (
		filePath : string
	) : boolean => bookmarkedFiles.has(filePath);

	// 메타데이터 조회 -----------------------------------------------------------------
	const getAllBookmarks = (
	) : BookmarkMetadata[] => Array.from(bookmarkedFiles.values());

	// 특정 메타데이터 조회 --------------------------------------------------------------
	const getBookmark = (
		originalPath : string
	) : BookmarkMetadata | undefined => bookmarkedFiles.get(originalPath);

	// 원본 경로 변경 시 메타데이터 갱신 -----------------------------------------------
	const updateOriginalPath = async (
		oldPath : string,
		newPath : string
	) : Promise<void> => {
		const metadata = bookmarkedFiles.get(oldPath);

		metadata && await (async () => {
			bookmarkedFiles.delete(oldPath);
			disposeWatcherFor(oldPath);

			metadata.originalPath = newPath;

			const metadataPath = path.join(bookmarkPath, `${metadata.bookmarkName}${METADATA_EXT}`);
			await saveMetadata(metadataPath, metadata);

			bookmarkedFiles.set(newPath, metadata);
			createWatcherFor(newPath);

			onSyncUpdate && onSyncUpdate(newPath, BookmarkStatus.SYNCED);
			onRefreshNeeded && onRefreshNeeded();
		})();
	};

	// 메타데이터 저장 --------------------------------------------------------------------
	const saveMetadata = async (
		metadataPath : string,
		metadata : BookmarkMetadata
	) : Promise<void> => {
		const content = JSON.stringify(metadata, null, 2);
		await vscode.workspace.fs.writeFile(
			vscode.Uri.file(metadataPath),
			new TextEncoder().encode(content)
		);
	};

	// 메타데이터 로드 --------------------------------------------------------------------
	const loadMetadata = async (
		metadataPath : string
	) : Promise<BookmarkMetadata | null> => {
		try {
			const content = await vscode.workspace.fs.readFile(vscode.Uri.file(metadataPath));
			return JSON.parse(content.toString()) as BookmarkMetadata;
		}
		catch {
			return null;
		}
	};

	// 리소스 정리 -------------------------------------------------------------------
	const dispose = (
	) : void => {
		disposables.forEach((d) => d.dispose());
		bookmarkWatchers.forEach((watcher) => watcher.dispose());
		bookmarkWatchers.clear();
		bookmarkedFiles.clear();
	};

	// 초기화 ----------------------------------------------------------------------------
	setupEventListeners();
	loadExistingBookmarks().catch((err) => {
		logger(`error`, `activate - ${err instanceof Error ? err.message : String(err)}`);
	});

	// 99. return -----------------------------------------------------------------------------
	return {
		addBookmark,
		renameBookmark,
		removeBookmark,
		getAllBookmarks,
		getBookmark,
		updateOriginalPath,
		dispose,
	};
};
