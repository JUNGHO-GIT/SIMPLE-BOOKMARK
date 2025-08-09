// DirectoryWorker.ts

import * as vscode from "vscode";
import * as path from "path";
import { FileSystemObject, FileSystemObjectType, setContextValue } from "../types/FileSystemObject";
import { TypedDirectoryType, buildTypedDirectory } from "../types/TypedDirectory";

// -----------------------------------------------------------------------------------------------------------------
export type DirectoryWorkerType = ReturnType<typeof DirectoryWorker>;
export const DirectoryWorker = (
	extensionContext: vscode.ExtensionContext,
	workspaceRoot: readonly vscode.WorkspaceFolder[] | undefined
) : {
	readonly vsCodeExtensionConfigurationKey: string
	readonly saveWorkspaceConfigurationSettingKey: string
	readonly storedBookmarksContextKey: string
	readonly bookmarkedDirectoryContextValue: string
	bookmarkedDirectories: TypedDirectoryType[]
	saveWorkspaceSetting: boolean | undefined

	getChildren: (element?: FileSystemObjectType) => Promise<FileSystemObjectType[]>
	openOrReveal: (uri: string | undefined) => Promise<void>
	addItem: (uri: string | undefined) => Promise<void>
	removeItem: (uri: string) => Promise<void>
	removeAllItems: () => Promise<void>

	// 선택사항: 트리뷰 provider 주입 (openOrReveal에서 선택 복원에 사용)
	setDirectoryProvider?: (provider: vscode.TreeDataProvider<FileSystemObjectType>) => void
} => {

	// 0. 상수 및 상태 변수 ----------------------------------------------------------------------------------------
	const vsCodeExtensionConfigurationKey: string = "JEXPLORER";
	const saveWorkspaceConfigurationSettingKey: string = "saveWorkspace";
	const storedBookmarksContextKey: string = "storedBookmarks";
	const bookmarkedDirectoryContextValue: string = "directlyBookmarkedDirectory";
	let bookmarkedDirectories: TypedDirectoryType[] = [];
	let saveWorkspaceSetting: boolean | undefined = false;
	let injectedDirectoryProvider: vscode.TreeDataProvider<FileSystemObjectType> | undefined = undefined;

	// 0. 생성자 --------------------------------------------------------------------------------------------------
	const hydrateState = async (): Promise<void> => {
		saveWorkspaceSetting = vscode.workspace
		.getConfiguration(vsCodeExtensionConfigurationKey)
		.get(saveWorkspaceConfigurationSettingKey);

		const stored = (
			workspaceRoot
			? extensionContext.workspaceState.get<TypedDirectoryType[]>(storedBookmarksContextKey)
			: extensionContext.globalState.get<TypedDirectoryType[]>(storedBookmarksContextKey)
		) || [];

		const result = stored.sort(sortByDirThenExtThenName);
		bookmarkedDirectories = result;
	};
	// constructor 대체 호출
	void hydrateState();

	// 1. 북마크된 디렉토리 가져오기 -------------------------------------------------------------------------------
	function sortByDirThenExtThenName(a: { type: number; path: string }, b: { type: number; path: string }): number {
		if (a.type === vscode.FileType.Directory && b.type !== vscode.FileType.Directory) {
			return -1;
		}
		if (a.type !== vscode.FileType.Directory && b.type === vscode.FileType.Directory) {
			return 1;
		}
		if (a.type === vscode.FileType.File && b.type === vscode.FileType.File) {
			const extA = path.extname(a.path).toLowerCase();
			const extB = path.extname(b.path).toLowerCase();
			if (extA !== extB) {
				return extA.localeCompare(extB);
			}
			return path.basename(a.path).localeCompare(path.basename(b.path));
		}
		return path.basename(a.path).localeCompare(path.basename(b.path));
	};

	// 2. 자식 요소 가져오기 ----------------------------------------------------------------------------------------
	const getChildren = async (element?: FileSystemObjectType): Promise<FileSystemObjectType[]> => {
		if (element && element.resourceUri) {
			const result = await directorySearch(element.resourceUri.fsPath);
			return result;
		}
		else {
			if (bookmarkedDirectories.length > 0) {
				const sortedBookmarks = [...bookmarkedDirectories].sort(sortByDirThenExtThenName);
				const result = await createEntries(sortedBookmarks);
				return result;
			}
			else {
				const result: FileSystemObjectType[] = [];
				return result;
			}
		}
	};

	// 3. 아이템 열기/선택 -----------------------------------------------------------------------------------
	const openOrReveal = async (uri: string | undefined) => {
		if (!uri) {
			return;
		}
		const resource = vscode.Uri.file(uri);
		const stat = await vscode.workspace.fs.stat(resource);

		if (stat.type === vscode.FileType.File) {
			const document = await vscode.workspace.openTextDocument(resource);
			await vscode.window.showTextDocument(document, {
				preserveFocus: false,
				viewColumn: vscode.ViewColumn.Active,
				preview: false
			});
		}

		// 1. 일반 탐색기에서 표시
		await vscode.commands.executeCommand("revealInExplorer", uri);

		// 2. 잠깐 기다렸다가 북마크 뷰로 포커스 복구 및 selection도 복원
		setTimeout(async () => {
			// JEXPLORER 트리뷰로 포커스
			await vscode.commands.executeCommand("workbench.view.extension.JEXPLORER");
			if (injectedDirectoryProvider) {
				const treeView = vscode.window.createTreeView("JEXPLORER", {
					treeDataProvider: injectedDirectoryProvider,
					showCollapseAll: true,
					canSelectMany: false
				});
				treeView.reveal(
					FileSystemObject(
						path.basename(uri),
						stat.type === vscode.FileType.File
						? vscode.TreeItemCollapsibleState.None
						: vscode.TreeItemCollapsibleState.Collapsed,
						vscode.Uri.file(uri)
					),
					{ select: true, focus: true }
				);
			}
		}, 200);
	};

	// 4. 아이템 추가 -----------------------------------------------------------------------------------------------
	const addItem = async (uri: string | undefined) => {
		if (uri) {
			const already = bookmarkedDirectories.find(
				(b) => vscode.Uri.file(b.path).fsPath.toLowerCase() === uri.toLowerCase()
			);
			if (!already) {
				bookmarkedDirectories.push(await buildTypedDirectory(vscode.Uri.file(uri)));
				bookmarkedDirectories.sort(sortByDirThenExtThenName);
				await saveBookmarks();
			}
		}
	};

	// 5. 아이템 제거 -----------------------------------------------------------------------------------------------
	const removeItem = async (uri: string) => {
		const targetPath = uri.toLowerCase();
		// 북마크된 디렉토리에서 해당 경로를 찾아 제거
		bookmarkedDirectories = bookmarkedDirectories.filter((dir) => {
			return vscode.Uri.file(dir.path).fsPath.toLowerCase() !== targetPath;
		});

		// 변화 내용을 항상 저장 (마지막 항목 삭제 케이스 포함)
		await saveBookmarks();
	};

	// 6. 모든 아이템 제거 ------------------------------------------------------------------------------------------
	const removeAllItems = async () => {
		bookmarkedDirectories = [];
		await saveBookmarks();
	};

	// 7. 디렉토리 검색 -------------------------------------------------------------------------------------------
	const directorySearch = async (uri: string) => {
		const entries = await vscode.workspace.fs.readDirectory(vscode.Uri.file(uri));
		const result = entries
			.sort((a, b) => {
				const isADir = a[1] === vscode.FileType.Directory;
				const isBDir = b[1] === vscode.FileType.Directory;
				if (isADir && !isBDir) {
					return -1;
				}
				if (!isADir && isBDir) {
					return 1;
				}
				if (!isADir && !isBDir) {
					const extA = path.extname(a[0]).toLowerCase();
					const extB = path.extname(b[0]).toLowerCase();
					if (extA !== extB) {
						return extA.localeCompare(extB);
					}
					return a[0].localeCompare(b[0]);
				}
				return a[0].localeCompare(b[0]);
			})
			.map((item) => {
				const [name, type] = item;
				const isDirectory =
					type === vscode.FileType.Directory
					? vscode.TreeItemCollapsibleState.Collapsed
					: vscode.TreeItemCollapsibleState.None;

				return FileSystemObject(
					name,
					isDirectory,
					vscode.Uri.file(path.join(uri, name))
				);
			});
		return result;
	};

	// 8. 북마크된 디렉토리 엔트리 생성 ---------------------------------------------------------------------------
	const createEntries = async (dirs: TypedDirectoryType[]) => {
		let fileSystem: FileSystemObjectType[] = [];
		for (const dir of dirs) {
			fileSystem.push(
				setContextValue(
					FileSystemObject(
						path.basename(dir.path),
						dir.type === vscode.FileType.File
						? vscode.TreeItemCollapsibleState.None
						: vscode.TreeItemCollapsibleState.Collapsed,
						vscode.Uri.file(vscode.Uri.file(dir.path).fsPath)
					),
					bookmarkedDirectoryContextValue
				)
			);
		}
		return fileSystem;
	};

	// 10. 북마크 저장 ---------------------------------------------------------------------------------------------
	const saveBookmarks = async () => {
		if (workspaceRoot) {
			await extensionContext.workspaceState.update(
				storedBookmarksContextKey,
				bookmarkedDirectories
			);
		}
		else {
			await extensionContext.globalState.update(
				storedBookmarksContextKey,
				bookmarkedDirectories
			);
		}
	};

	// 11. 트리뷰 provider 주입 -----------------------------------------------------------------------------------
	const setDirectoryProvider = (provider: vscode.TreeDataProvider<FileSystemObjectType>) => {
		injectedDirectoryProvider = provider;
	};

	// 0. return --------------------------------------------------------------------------------------------------
	return {
		vsCodeExtensionConfigurationKey,
		saveWorkspaceConfigurationSettingKey,
		storedBookmarksContextKey,
		bookmarkedDirectoryContextValue,
		get bookmarkedDirectories() { return bookmarkedDirectories; },
		set bookmarkedDirectories(v: TypedDirectoryType[]) { bookmarkedDirectories = v; },
		get saveWorkspaceSetting() { return saveWorkspaceSetting; },
		set saveWorkspaceSetting(v: boolean | undefined) { saveWorkspaceSetting = v; },
		getChildren,
		openOrReveal,
		addItem,
		removeItem,
		removeAllItems,
		setDirectoryProvider
	};
};