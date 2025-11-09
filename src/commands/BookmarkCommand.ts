// commands/BookmarkCommand.ts

import { vscode, path, Minimatch } from "@exportLibs";
import { validateFileName } from "@exportScripts";
import { notify, log } from "@exportScripts";
import { LRUCache, isFileType } from "@exportScripts";
import type { BookmarkProviderType, BookmarkModelType, ExcludeRuleType } from "@exportTypes";

// -----------------------------------------------------------------------------------------
export const BookmarkCommand = (
	provider : BookmarkProviderType,
	_context : vscode.ExtensionContext
) => {

	// 0. 변수 설정 ----------------------------------------------------------------------------
	let excludeRuleCache = new LRUCache<string, ExcludeRuleType[]>(50);
	let selectedBookmarks : BookmarkModelType[] = [];
	let minimatchOptions = { dot : true, nocase : process.platform === "win32" } as const;

	// 윈도우 경로 구분자를 POSIX 형식("/")으로 변환 --------------------------------------------
	const toPosixPath = (
		value: string
	): string => {
		return value.replace(/\\/g, "/");
	};

	// 워크스페이스 폴더 기준의 상대 경로를 구하고 POSIX 형식으로 반환 --------------------------
	const getRelativePath = (
		folder: vscode.WorkspaceFolder,
		target: vscode.Uri
	): string => {
		const relative = path.relative(folder.uri.fsPath, target.fsPath);
		return relative ? toPosixPath(relative) : "";
	};

	// files.exclude 설정을 읽어 Minimatch 규칙 목록을 생성/캐시 --------------------------------
	const getExcludeRuleTypesForFolder = (
		folder: vscode.WorkspaceFolder
	): ExcludeRuleType[] => {
		const cacheKey = folder.uri.toString(true);
		const cached = excludeRuleCache.get(cacheKey);

		return cached ? cached : (() => {
			const config = vscode.workspace.getConfiguration("files", folder.uri);
			const raw = config.get<Record<string, boolean | {when?: string}>>("exclude") ?? {};
			const rules: ExcludeRuleType[] = [];

			for (const [pattern, value] of Object.entries(raw)) {
				typeof value === "boolean"
				? (value && rules.push({matcher: new Minimatch(pattern, minimatchOptions)}))
				: (value && typeof value === "object" && typeof (value as any).when === "string"
					&& rules.push({matcher: new Minimatch(pattern, minimatchOptions), when: (value as any).when}));
			}

			excludeRuleCache.set(cacheKey, rules);
			return rules;
		})();
	};

	// 조건부 숨김 여부를 결정 --------------------------------------------------------------------
	const evaluateWhenClause = async (
		whenClause: string,
		folder: vscode.WorkspaceFolder,
		relativePath: string
	): Promise<boolean> => {
		return whenClause.includes("$(basename)")
		? await (async () => {
			const fileName = path.posix.basename(relativePath);
			const extension = path.posix.extname(fileName);
			const baseName = extension ? fileName.slice(0, -extension.length) : fileName;
			const substituted = whenClause.replace(/\$\(basename\)/g, baseName);
			const directory = path.posix.dirname(relativePath);
			const siblingRelative = directory === "." ? substituted : `${directory}/${substituted}`;
			const segments = siblingRelative.split("/").filter((segment) => segment.length > 0);
			const siblingUri = vscode.Uri.joinPath(folder.uri, ...segments);

			try {
				await vscode.workspace.fs.stat(siblingUri);
				return true;
			}
			catch {
				return false;
			}
		})()
		: false;
	};

	// 스킵할지 여부를 판단 -----------------------------------------------------------------------
	const shouldSkipEntry = async (
		uri : vscode.Uri,
		folderHint? : vscode.WorkspaceFolder,
		kind? : vscode.FileType
	) : Promise<boolean> => {
		const folder = folderHint ?? vscode.workspace.getWorkspaceFolder(uri);
		return !folder
		? false
		: (() => {
			const relative = getRelativePath(folder, uri);
			return relative.length === 0
				? false
				: (() => {
					const name = path.posix.basename(relative);
					return name.startsWith(".")
					? true
					: (() => {
						const rules = getExcludeRuleTypesForFolder(folder);
						return rules.length === 0
						? false
						: (async () => {
							const candidates = [relative];
							!relative.startsWith("/") && candidates.push(`/${relative}`);
							!relative.startsWith("./") && candidates.push(`./${relative}`);

							const isDirectory = typeof kind !== "undefined"
								&& isFileType(kind, vscode.FileType.Directory);

							for (const rule of rules) {
								const matched = candidates.some((candidate) => rule.matcher.match(candidate));
								if (!matched) {
									continue;
								}
								if (!rule.when) {
									return true;
								}
								if (isDirectory) {
									continue;
								}
								if (await evaluateWhenClause(rule.when, folder, relative)) {
									return true;
								}
							}
							return false;
						})();
					})();
			})();
		})();
	};

	// 비동기 흐름 제어 -----------------------------------------------------------------------
	const delay = async (
		ms: number
	): Promise<void> => {
		await new Promise((resolve) => {
			setTimeout(resolve, ms);
		});
	};

	// Explorer 항목을 재귀적으로 확장 ------------------------------------------------------
	const expandAllExplorerFolders = async () : Promise<void> => {
		try {
			await vscode.commands.executeCommand("workbench.view.explorer");
			await delay(100);

			const workspaceFolders = vscode.workspace.workspaceFolders;
			if (!workspaceFolders || workspaceFolders.length === 0) {
				return;
			}
			for (const folder of workspaceFolders) {
				await expandFolderRecursively(folder.uri);
			}
		}
		catch (error) {
			log(`debug`, `select`, error instanceof Error ? error.message : String(error));
		}
	};

	// 지정된 폴더와 하위 폴더 순차적으로 확장 --------------------------------------------------
	const expandFolderRecursively = async (
		folderUri : vscode.Uri
	) : Promise<void> => {
		try {
			// 폴더를 Explorer에 표시하고 확장
			await vscode.commands.executeCommand("revealInExplorer", folderUri);
			await delay(10);
			await vscode.commands.executeCommand("list.expand");
			await delay(10);

			// 하위 폴더 찾기
			const entries = await vscode.workspace.fs.readDirectory(folderUri);
			const folder = vscode.workspace.getWorkspaceFolder(folderUri);

			const filteredEntries = await Promise.all(
				entries
					.filter(([_name, type]: [string, vscode.FileType]) => isFileType(type, vscode.FileType.Directory))
					.map(async ([name, type]: [string, vscode.FileType]) => {
						const childUri = vscode.Uri.joinPath(folderUri, name);
						const shouldSkip = await shouldSkipEntry(childUri, folder, type);
						return shouldSkip ? null : childUri;
					})
			);

			const subDirectories = filteredEntries.filter((uri: vscode.Uri | null) => uri !== null) as vscode.Uri[];

			// 하위 폴더들을 재귀적으로 확장
			for (const subDir of subDirectories) {
				await expandFolderRecursively(subDir);
			}
		}
		catch (error) {
			log(`debug`, `expand`, `${folderUri.fsPath} ${error instanceof Error ? error.message : String(error)}`);
		}
	};

	// 선택된 아이템 업데이트 -----------------------------------------------------------------
	const updateSelectedBookmark = (
		items : BookmarkModelType[]
	) : void => {
		selectedBookmarks = items;
	};

	// 북마크 새로고침 -------------------------------------------------------------------------
	const registerRefreshCommand = (
	) : vscode.Disposable => vscode.commands.registerCommand(
		"simple-bookmark.refreshentry", () => {
			log(`debug`, `select`, `Refresh command executed`);
			provider.refresh();
		}
	);

	// 북마크 추가 (Explorer 선택 기반) --------------------------------------------------------
	const registerAddBookmarkCommand = (
	) : vscode.Disposable => vscode.commands.registerCommand(
		"simple-bookmark.addbookmark", async (uri? : vscode.Uri) => {
			return uri
			? await (async () => {
				const stat = await vscode.workspace.fs.stat(uri);
				const bookmarkName = path.basename(uri.fsPath);
				return (stat.type === vscode.FileType.Directory || stat.type === vscode.FileType.File)
					? (await provider.addBookmark(uri.fsPath, bookmarkName), provider.refresh())
					: notify(`error`, `add`, "Only files or folders can be added.");
			})()
			: await (async () => {
				await vscode.commands.executeCommand("copyFilePath");
				const copied = await vscode.env.clipboard.readText();
				const picked = copied ? vscode.Uri.file(copied.split(/\r?\n/)[0]) : undefined;
					return picked
						? await (async () => {
						const stat = await vscode.workspace.fs.stat(picked);
						const bookmarkName = path.basename(picked.fsPath);
						return (stat.type === vscode.FileType.Directory || stat.type === vscode.FileType.File)
								? (await provider.addBookmark(picked.fsPath, bookmarkName), provider.refresh())
								: notify(`error`, `add`, "Only files or folders can be added.");
					})()
								: notify(`error`, `add`, "No file or folder selected in Explorer.");
			})();
		}
	);

	// 북마크 제거 (북마크만 또는 북마크 + 원본 선택 삭제) -----------------------------------------------
	const registerRemoveBookmarkCommand = (
	) : vscode.Disposable => vscode.commands.registerCommand(
		"simple-bookmark.removebookmark",
		async (item? : BookmarkModelType) => {
			const itemsToRemove : string[] = item
			? [item.originalPath]
			: (selectedBookmarks.length > 0
				? selectedBookmarks
					.filter((i) => provider.isRootBookmark(i.originalPath))
					.map((i) => i.originalPath)
				: []
			);

			return itemsToRemove.length === 0
				? notify(`error`, `remove`, "No bookmarks selected to remove.")
			: await (async () => {
				const config = vscode.workspace.getConfiguration("simple-bookmark");
				const deleteMode = config.get<string>("deleteMode", "ask");

				let deleteOriginal : boolean = false;

				if (deleteMode === "bookmarkOnly") {
					deleteOriginal = false;
				} else if (deleteMode === "bookmarkAndOriginal") {
					deleteOriginal = true;
				} else {
					const itemCountText = itemsToRemove.length === 1
						? "1 bookmark"
						: `${itemsToRemove.length} bookmarks`;

					const choice = await vscode.window.showWarningMessage(
						`How would you like to delete ${itemCountText}?`,
						{modal : true},
						"Bookmark Only",
						"Bookmark + Original File"
					);

					if (!choice) {
						return;
					}

					deleteOriginal = choice === "Bookmark + Original File";
				}

				for (const originalPath of itemsToRemove) {
					await provider.removeBookmark(originalPath, deleteOriginal);
				}
				provider.refresh();

				const successMessage = itemsToRemove.length === 1
					? (deleteOriginal ? "Bookmark and original file deleted" : "Bookmark deleted")
					: (deleteOriginal ? `${itemsToRemove.length} bookmarks and original files deleted` : `${itemsToRemove.length} bookmarks deleted`);

				notify(`info`, `remove`, successMessage);
			})();
		}
	);

	// 북마크 이름 변경 (루트뿐 아니라 모든 상황에서 허용) -----------------------------------------
	const registerRenameBookmarkCommand = (
	) : vscode.Disposable => vscode.commands.registerCommand(
		"simple-bookmark.renamebookmark",
		async (item? : BookmarkModelType) => {
			const target : BookmarkModelType | undefined = item || (selectedBookmarks.length > 0 ? selectedBookmarks[0] : undefined);

			return !target
				? notify(`error`, `rename`, "No bookmark selected to rename.")
			: await (async () => {
				const currentName = target.bookmarkMetadata.bookmarkName;

				const newName = await vscode.window.showInputBox({
					prompt : "[simple-bookmark] Enter new bookmark name",
					value : currentName,
					validateInput : (v : string) => validateFileName(v)
				});

				return !newName
					? void 0
					: await (async () => {
						await provider.renameBookmark(target.originalPath, newName.trim());
						provider.refresh();
						notify(`info`, `rename`, `renamed ${currentName} → ${newName.trim()}`);
					})();
			})();
		}
	);

	// 복사 ----------------------------------------------------------------------------------
	const registerCopyBookmarkCommand = (
	) : vscode.Disposable => vscode.commands.registerCommand(
		"simple-bookmark.copybookmark",
		(
			item? : BookmarkModelType,
			selected? : BookmarkModelType[]
		) => {
			let targets : BookmarkModelType[] = Array.isArray(selected) && selected.length > 0
			? selected
			: (selectedBookmarks.length > 0
				? selectedBookmarks
				: (item ? [item] : [])
			);

		return targets.length === 0
				? notify(`error`, `copy`, "No items selected to copy.")
		: (() => {
				const dedupMap = new Map<string, BookmarkModelType>();
				for (const t of targets) {
					!dedupMap.has(t.originalPath) && dedupMap.set(t.originalPath, t);
				}
				targets = Array.from(dedupMap.values());

				const available = targets.filter((t) => t.isOriginalAvailable);
				return available.length === 0
					? notify(`warn`, `copy`, "No available original files to copy.")
				: (() => {
					updateSelectedBookmark(available);
					provider.copyBookmarks(available);
					provider.refresh();
				})();
			})();
		}
	);

	// 붙여넣기 ---------------------------------------------------------------------------
	const registerPasteBookmarkCommand = (
	) : vscode.Disposable => vscode.commands.registerCommand(
		"simple-bookmark.pastebookmark", async (item? : BookmarkModelType) => {
			return !provider.hasCopiedItems()
				? notify(`error`, `paste`, "No items to paste.")
			: await (async () => {
				return !item && selectedBookmarks.length === 0
					? await (async () => {
						await provider.pasteItemsToRoot();
						provider.refresh();
					})()
					: await (async () => {
						const targetPath : string | undefined = item
							? (updateSelectedBookmark([item]), (!item.bookmarkMetadata.isFile && item.isOriginalAvailable) ? item.originalPath : path.dirname(item.originalPath))
							: (selectedBookmarks.length > 0
								? (() => {
									const folder = selectedBookmarks.find((s) => !s.bookmarkMetadata.isFile && s.isOriginalAvailable);
									return folder ? folder.originalPath : path.dirname(selectedBookmarks[0].originalPath);
								})()
								: provider.rootPath
							);

						return targetPath
							? await (async () => {
								log(`debug`, `paste`, `${targetPath as string}`);
								await provider.pasteItems(targetPath as string);
								provider.refresh();
							})()
							: notify(`warn`, `paste`, "Select a valid target folder to paste into.");
					})();
			})();
		}
	);

	// 붙여넣기(루트 전용) -----------------------------------------------------------------
	const registerPasteToRootBookmarkCommand = (
	) : vscode.Disposable => vscode.commands.registerCommand(
		"simple-bookmark.pasterootbookmark",
		async () => {
			return !provider.hasCopiedItems()
				? notify(`error`, `paste`, "No items to paste.")
			: await (async () => {
				await provider.pasteItemsToRoot();
				provider.refresh();
			})();
		}
	);

	// 모든 북마크 삭제 --------------------------------------------------------------------
	const registerDeleteAllBookmarkCommand = (
	) : vscode.Disposable => vscode.commands.registerCommand(
		"simple-bookmark.removeallbookmark",
		async () => {
			const allItems = await provider.getChildren();

			return !allItems || allItems.length === 0
				? notify(`info`, `remove`, "No bookmarks to remove.")
			: await (async () => {
				const config = vscode.workspace.getConfiguration("simple-bookmark");
				const deleteMode = config.get<string>("deleteMode", "ask");

				let deleteOriginal : boolean = false;

				if (deleteMode === "bookmarkOnly") {
					deleteOriginal = false;
				} else if (deleteMode === "bookmarkAndOriginal") {
					deleteOriginal = true;
				} else {
					const choice = await vscode.window.showWarningMessage(
						`How would you like to delete all ${allItems.length} bookmarks?`,
						{modal : true},
						"Bookmark Only",
						"Bookmark + Original File"
					);

					if (!choice) {
						return;
					}

					deleteOriginal = choice === "Bookmark + Original File";
				}

				for (const item of allItems) {
					await provider.removeBookmark(item.originalPath, deleteOriginal);
				}
				provider.refresh();

				const successMessage = deleteOriginal
					? `All ${allItems.length} bookmarks and original files deleted`
					: `All ${allItems.length} bookmarks deleted`;

				notify(`info`, `remove`, successMessage);
			})();
		}
	);

	// 폴더 생성 --------------------------------------------------------------------------
	const registerCreateFolderCommand = (
	) : vscode.Disposable => vscode.commands.registerCommand(
		"simple-bookmark.createfolder",
		async (item? : BookmarkModelType) => {
			const folderName = await vscode.window.showInputBox({
				prompt : "[simple-bookmark] Enter folder name (will be created in original location)",
				validateInput : validateFileName
			});

			return !folderName
			? void 0
			: await (async () => {
				const parentPath : string | undefined = (item && !item.bookmarkMetadata.isFile && item.isOriginalAvailable)
					? item.originalPath
					: (await vscode.window.showOpenDialog({
						canSelectFiles : false,
						canSelectFolders : true,
						canSelectMany : false,
						openLabel : "[simple-bookmark] Select Parent Folder"
					}))?.[0]?.fsPath;

				return parentPath
					? (await provider.createFolder(parentPath, folderName.trim()), provider.refresh())
					: notify(`warn`, `create`, "Please select a valid parent folder.");
			})();
		}
	);

	// 파일 생성 --------------------------------------------------------------------------
	const registerCreateFileCommand = (
	) : vscode.Disposable => vscode.commands.registerCommand(
		"simple-bookmark.createfile",
		async (item? : BookmarkModelType) => {
			const fileName = await vscode.window.showInputBox({
				prompt : "[simple-bookmark] Enter file name (will be created in original location)",
				validateInput : validateFileName
			});

			return !fileName
			? void 0
			: await (async () => {
				const parentPath : string | undefined = (item && !item.bookmarkMetadata.isFile && item.isOriginalAvailable)
					? item.originalPath
					: (await vscode.window.showOpenDialog({
						canSelectFiles : false,
						canSelectFolders : true,
						canSelectMany : false,
						openLabel : "[simple-bookmark] Select Parent Folder"
					}))?.[0]?.fsPath;

				return parentPath
					? (await provider.createFile(parentPath, fileName.trim()), provider.refresh())
					: notify(`warn`, `create`, "Please select a valid parent folder.");
			})();
		}
	);

	// 탐색기 전체 확장 ------------------------------------------------------------------
	const registerExpandExplorerCommand = (
	) : vscode.Disposable => vscode.commands.registerCommand(
		"simple-bookmark.expandexplorer",
		async () => {
				log(`debug`, `select`, `registerExpandExplorerCommand`);

			const folders = vscode.workspace.workspaceFolders;

			return !folders || folders.length === 0
					? notify(`warn`, `select`, "No workspace folder available to expand.")
			: await (async () => {
				await vscode.commands.executeCommand("workbench.view.explorer");
				excludeRuleCache.clear();

				// 새로운 간소화된 전체 확장 방법 사용
				await expandAllExplorerFolders();
				notify(`info`, `select`, "Explorer expanded for all workspace folders.");
			})();
		}
	);

	// 특정 폴더 확장 ---------------------------------------------------------------------
	const registerExpandFolderCommand = (
	) : vscode.Disposable => vscode.commands.registerCommand(
		"simple-bookmark.expandfolder",
		async (uri : vscode.Uri) => {
			log(`debug`, `expand`, `${uri?.fsPath}`);

			// URI가 전달되지 않은 경우 (키보드 단축키로 실행한 경우) 현재 활성 편집기의 파일 사용
			if (!uri) {
				const activeEditor = vscode.window.activeTextEditor;
				// 현재 열린 파일의 디렉토리 사용
				if (activeEditor && activeEditor.document.uri.scheme === 'file') {
					uri = vscode.Uri.file(path.dirname(activeEditor.document.uri.fsPath));
				}
				// 활성 편집기가 없으면 첫 번째 워크스페이스 폴더 사용
					else {
						const workspaceFolders = vscode.workspace.workspaceFolders;
						if (workspaceFolders && workspaceFolders.length > 0) {
							uri = workspaceFolders[0].uri;
						}
						else {
							notify(`warn`, `select`, "No folder available to expand.");
							return;
						}
					}
			}

			try {
				// 폴더인지 확인
				const stat = await vscode.workspace.fs.stat(uri);
				if (!(stat.type & vscode.FileType.Directory)) {
					notify(`warn`, `select`, `selected item is not a folder ${uri.fsPath}`);
					return;
				}

				// Explorer 뷰로 이동
				await vscode.commands.executeCommand("workbench.view.explorer");
				await delay(100);

				// 폴더와 모든 하위 폴더를 확장
				log(`debug`, `expand`, `${uri.fsPath}`);
				await expandFolderRecursively(uri);

				notify(`info`, `expand`, `${path.basename(uri.fsPath)}`);
			}
			catch (error) {
				log(`debug`, `expand`, `${error}`);
				notify(`error`, `expand`, `${error}`);
			}
		}
	);

	// 99. return -----------------------------------------------------------------------------
	return {
		updateSelectedBookmark,
		registerCommands : () : vscode.Disposable[] => ([
			registerRefreshCommand(),
			registerAddBookmarkCommand(),
			registerRemoveBookmarkCommand(),
			registerRenameBookmarkCommand(),
			registerCopyBookmarkCommand(),
			registerPasteBookmarkCommand(),
			registerPasteToRootBookmarkCommand(),
			registerDeleteAllBookmarkCommand(),
			registerCreateFolderCommand(),
			registerCreateFileCommand(),
			registerExpandExplorerCommand(),
			registerExpandFolderCommand()
		])
	};
};
