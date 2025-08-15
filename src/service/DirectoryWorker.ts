// DirectoryWorker.ts

import * as vscode from "vscode";
import * as path from "path";
import { FileSystemObject, FileSystemObjectType, setContextValue } from "../types/FileSystemObject";
import { TypedDirectoryType, buildTypedDirectory } from "../types/TypedDirectory";

// -----------------------------------------------------------------------------------------------------------------
export type DirectoryWorkerType = ReturnType<typeof DirectoryWorker>;
export function DirectoryWorker(
	extensionContext: vscode.ExtensionContext,
	workspaceRoot: readonly vscode.WorkspaceFolder[] | undefined
) : {
	readonly vsCodeExtensionConfigurationKey: string
	readonly saveWorkspaceConfigurationSettingKey: string
	readonly storedBookmarksContextKey: string
	readonly bookmarkedDirectoryContextValue: string
	bookmarkedDirectories: TypedDirectoryType[]
	saveWorkspaceSetting: boolean | undefined

	getChildren(element?: FileSystemObjectType): Promise<FileSystemObjectType[]>
	openOrReveal(uri: string | undefined): Promise<void>
	addItem(pathToAdd: string): Promise<void>
	copyItem(copiedPath: string, destinationPath: string): Promise<void>
	pasteItem(pastedPath: string, targetPath: string): Promise<void>
	removeItem(pathToDelete: string): Promise<void>
	removeAllItems(): Promise<void>
	validateBookmarks(): Promise<void>
} {

	// 0. 상수 및 상태 변수 ----------------------------------------------------------------------------------------
	const vsCodeExtensionConfigurationKey: string = "JEXPLORER";
	const saveWorkspaceConfigurationSettingKey: string = "saveWorkspace";
	const storedBookmarksContextKey: string = "storedBookmarks";
	const bookmarkedDirectoryContextValue: string = "directlyBookmarkedDirectory";
	let bookmarkedDirectories: TypedDirectoryType[] = [];
	let saveWorkspaceSetting: boolean | undefined = false;

	// 0. 초기화 함수 ----------------------------------------------------------------------------------------------
	(async function hydrateState(): Promise<void> {
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

		await validateBookmarks();
	})();

	// 0. 북마크된 디렉토리 가져오기 -------------------------------------------------------------------------------
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
	}

	// 2. 자식 요소 가져오기 ----------------------------------------------------------------------------------------
	async function getChildren(element?: FileSystemObjectType): Promise<FileSystemObjectType[]> {
		if (element && element.resourceUri) {
			return await directorySearch(element.resourceUri.fsPath);
		} else {
			if (bookmarkedDirectories.length > 0) {
				const sortedBookmarks = [...bookmarkedDirectories].sort(sortByDirThenExtThenName);
				return await createEntries(sortedBookmarks);
			} else {
				return [];
			}
		}
	}

	// 3. 북마크 열기/선택 -------------------------------------------------------------------------------------------
	async function openOrReveal(uri: string | undefined): Promise<void> {
		if (!uri) {
			return;
		}
		try {
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
			else {
				await vscode.commands.executeCommand("revealInExplorer", resource);
			}
		} catch (error) {
			console.error("Error in openOrReveal:", error);
			vscode.window.showErrorMessage(`Cannot open: ${path.basename(uri)}`);
		}
	}

	// 4. 북마크 추가 -----------------------------------------------------------------------------------------------
	async function addItem(pathToAdd: string): Promise<void> {
		if (!pathToAdd) {
			vscode.window.showErrorMessage("No file or folder selected to add.");
			return;
		}
		const already = bookmarkedDirectories.find(
			(b) => vscode.Uri.file(b.path).fsPath.toLowerCase() === pathToAdd.toLowerCase()
		);
		if (!already) {
			bookmarkedDirectories.push(await buildTypedDirectory(vscode.Uri.file(pathToAdd)));
			bookmarkedDirectories.sort(sortByDirThenExtThenName);
			await saveBookmarks();
		}
		else {
			vscode.window.showInformationMessage("Item already bookmarked");
		}
	}

	// 5. 북마크 복사 ------------------------------------------------------------------------------------------------
	async function copyItem(sourcePath: string, destinationPath: string): Promise<void> {
		const sourceUri = vscode.Uri.file(sourcePath);
		const destinationUri = vscode.Uri.file(destinationPath);
		const sourceStat = await vscode.workspace.fs.stat(sourceUri);

		if (sourceStat.type === vscode.FileType.File) {
			const content = await vscode.workspace.fs.readFile(sourceUri);
			await vscode.workspace.fs.writeFile(destinationUri, content);
		}
		else {
			await vscode.workspace.fs.createDirectory(destinationUri);
			const entries = await vscode.workspace.fs.readDirectory(sourceUri);
			for (const [name, type] of entries) {
				const childSource = path.join(sourcePath, name);
				const childDest = path.join(destinationPath, name);
				await copyItem(childSource, childDest);
			}
		}
	}


	// 6. 북마크 붙여넣기 ------------------------------------------------------------------------------------------
	async function pasteItem(pastedPath: string, targetPath: string): Promise<void> {
		try {
			const targetStat = await vscode.workspace.fs.stat(vscode.Uri.file(targetPath));
			let destinationDir = targetPath;

			if (targetStat.type === vscode.FileType.File) {
				destinationDir = path.dirname(targetPath);
			}

			const sourceName = path.basename(pastedPath);
			const destinationPath = path.join(destinationDir, sourceName);

			try {
				await vscode.workspace.fs.stat(vscode.Uri.file(destinationPath));
				const newName = await generateUniqueFileName(destinationDir, sourceName);
				const newDestinationPath = path.join(destinationDir, newName);
				await copyItem(pastedPath, newDestinationPath);
				vscode.window.showInformationMessage(`Pasted as: ${newName}`);
			}
			catch {
				await copyItem(pastedPath, destinationPath);
				vscode.window.showInformationMessage(`Pasted: ${sourceName}`);
			}
		}
		catch (error) {
			vscode.window.showErrorMessage(`Failed to paste: ${error}`);
		}
	}

	// 7. 북마크 삭제 ----------------------------------------------------------------------------------------------
	async function removeItem(pathToDelete: string): Promise<void> {
		if (!pathToDelete) {
			vscode.window.showErrorMessage("No file or folder selected to remove.");
			return;
		}
		bookmarkedDirectories = bookmarkedDirectories.filter((dir) => {
			return vscode.Uri.file(dir.path).fsPath.toLowerCase() !== pathToDelete.toLowerCase();
		});
		await saveBookmarks();
	}

	// 8. 북마크 전체 삭제 -----------------------------------------------------------------------------------------
	async function removeAllItems(): Promise<void> {
		bookmarkedDirectories = [];
		await saveBookmarks();
	}

	// 9. 고유한 파일명 생성 -----------------------------------------------------------------------------------------
	async function generateUniqueFileName(dir: string, fileName: string): Promise<string> {
		const ext = path.extname(fileName);
		const baseName = path.basename(fileName, ext);
		let counter = 1;
		let newName = fileName;

		while (true) {
			try {
				await vscode.workspace.fs.stat(vscode.Uri.file(path.join(dir, newName)));
				newName = `${baseName}_copy${counter}${ext}`;
				counter++;
			}
			catch {
				return newName;
			}
		}
	}

	// 10. 북마크 유효성 검사 ---------------------------------------------------------------------------------------
	async function validateBookmarks(): Promise<void> {
		const validBookmarks: TypedDirectoryType[] = [];

		for (const bookmark of bookmarkedDirectories) {
			try {
				await vscode.workspace.fs.stat(vscode.Uri.file(bookmark.path));
				validBookmarks.push(bookmark);
			}
			catch {
				console.log(`Removing invalid bookmark: ${bookmark.path}`);
			}
		}

		if (validBookmarks.length !== bookmarkedDirectories.length) {
			bookmarkedDirectories = validBookmarks;
			await saveBookmarks();
		}
	}

	// 11. 디렉토리 검색 -------------------------------------------------------------------------------------------
	async function directorySearch(uri: string): Promise<FileSystemObjectType[]> {
		const entries = await vscode.workspace.fs.readDirectory(vscode.Uri.file(uri));
		return entries
			.sort((a, b) => {
				const isADir = a[1] === vscode.FileType.Directory;
				const isBDir = b[1] === vscode.FileType.Directory;
				if (isADir && !isBDir) return -1;
				if (!isADir && isBDir) return 1;
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
				const isDirectory
					= type === vscode.FileType.Directory
					? vscode.TreeItemCollapsibleState.Collapsed
					: vscode.TreeItemCollapsibleState.None;

				return FileSystemObject(
					name,
					isDirectory,
					vscode.Uri.file(path.join(uri, name))
				);
			});
	}

	// 12. 북마크된 디렉토리 엔트리 생성 ---------------------------------------------------------------------------
	async function createEntries(dirs: TypedDirectoryType[]): Promise<FileSystemObjectType[]> {
		const fileSystem: FileSystemObjectType[] = [];
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
	}

	// 13. 북마크 저장 ---------------------------------------------------------------------------------------------
	async function saveBookmarks(): Promise<void> {
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
	}

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
		copyItem,
		pasteItem,
		removeItem,
		removeAllItems,
		validateBookmarks
	};
}