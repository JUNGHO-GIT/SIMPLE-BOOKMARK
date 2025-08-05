// DirectoryWorker.ts

import * as vscode from "vscode";
import * as path from "path";
import { FileSystemObject } from "../types/FileSystemObject";
import { TypedDirectory, buildTypedDirectory } from "../types/TypedDirectory";

// -----------------------------------------------------------------------------------------------------------------
export class DirectoryWorker {

	// 0. 상수 및 상태 변수 ----------------------------------------------------------------------------------------
	readonly vsCodeExtensionConfigurationKey: string = "JEXPLORER";
	readonly saveWorkspaceConfigurationSettingKey: string = "saveWorkspace";
	readonly storedBookmarksContextKey: string = "storedBookmarks";
	readonly bookmarkedDirectoryContextValue: string = "directlyBookmarkedDirectory";
	bookmarkedDirectories: TypedDirectory[] = [];
	saveWorkspaceSetting: boolean | undefined = false;

	// 0. 생성자 --------------------------------------------------------------------------------------------------
	constructor(
		private extensionContext: vscode.ExtensionContext,
		private workspaceRoot: readonly vscode.WorkspaceFolder[] | undefined
	) {
		this.hydrateState();
	}

	// 1. 북마크된 디렉토리 가져오기 -------------------------------------------------------------------------------
	private sortByDirThenExtThenName(a: { type: number; path: string }, b: { type: number; path: string }): number {
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
	public async getChildren(element?: FileSystemObject): Promise<FileSystemObject[]> {
		if (element && element.resourceUri) {
			const result = await this.directorySearch(element.resourceUri);
			return result;
		}
		else {
			if (this.bookmarkedDirectories.length > 0) {
				const sortedBookmarks = [...this.bookmarkedDirectories].sort(this.sortByDirThenExtThenName);
				const result = await this.createEntries(sortedBookmarks);
				return result;
			}
			else {
				const result: FileSystemObject[] = [];
				return result;
			}
		}
	}

	// 3. 아이템 열기/선택 -----------------------------------------------------------------------------------
	public async openOrReveal(uri: vscode.Uri | undefined) {
		if (!uri) {
			return;
		}
		try {
			const stat = await vscode.workspace.fs.stat(uri);

			if (stat.type === vscode.FileType.File) {
				const document = await vscode.workspace.openTextDocument(uri);
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
				// 트리뷰의 아이템을 선택 상태로 만듦 (포커스까지)
				const treeView = vscode.window.createTreeView("JEXPLORER", {
					treeDataProvider: (this as any).directoryProvider,
					showCollapseAll: true,
					canSelectMany: false
				});
				treeView.reveal(
					new FileSystemObject(
						path.basename(uri.fsPath),
						stat.type === vscode.FileType.File
							? vscode.TreeItemCollapsibleState.None
							: vscode.TreeItemCollapsibleState.Collapsed,
						uri
					),
					{ select: true, focus: true }
				);
			}, 200);
		}
		catch (err) {
			vscode.window.showErrorMessage(`could not open or reveal the item: ${err}`);
		}
	}

	// 4. 아이템 추가 -----------------------------------------------------------------------------------------------
	public async addItem(uri: vscode.Uri | undefined) {
		if (uri) {
			const already = this.bookmarkedDirectories.find(b => vscode.Uri.file(b.path).fsPath.toLowerCase() === uri.fsPath.toLowerCase());
			if (!already) {
				this.bookmarkedDirectories.push(await buildTypedDirectory(uri));
				this.bookmarkedDirectories.sort(this.sortByDirThenExtThenName);
				this.saveBookmarks();
			}
		}
	}

	// 5. 아이템 제거 -----------------------------------------------------------------------------------------------
	public async removeItem(uri: string) {
        const targetPath = uri.toLowerCase();
        const index = this.bookmarkedDirectories.findIndex(bookmark => {
            const bookmarkPath = vscode.Uri.file(bookmark.path).fsPath.toLowerCase();
            return bookmarkPath === targetPath;
        });
		this.bookmarkedDirectories.splice(index, 1);
        this.saveBookmarks();
	}

	// 6. 모든 아이템 제거 ------------------------------------------------------------------------------------------
	public async removeAllItems() {
		this.bookmarkedDirectories = [];
		this.saveBookmarks();
	}

	// 7. 디렉토리 검색 -------------------------------------------------------------------------------------------
	private async directorySearch(uri: vscode.Uri) {
		const entries = await vscode.workspace.fs.readDirectory(uri);
		const result = entries.sort((a, b) => {
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

			return new FileSystemObject(
				name,
				isDirectory,
				vscode.Uri.file(`${uri.path}/${name}`)
			);
		});
		return result
	}

	// 8. 북마크된 디렉토리 엔트리 생성 ---------------------------------------------------------------------------
	private async createEntries(bookmarkedDirectories: TypedDirectory[]) {
		let fileSystem: FileSystemObject[] = [];
		for (const dir of bookmarkedDirectories) {
			const { path: filePath, type: type } = dir;
			const file = vscode.Uri.file(filePath);
			fileSystem.push(
				new FileSystemObject(
					`${path.basename(dir.path)}`,
					type === vscode.FileType.File
						? vscode.TreeItemCollapsibleState.None
						: vscode.TreeItemCollapsibleState.Collapsed,
					file
				).setContextValue(this.bookmarkedDirectoryContextValue)
			);
		}
		const result = fileSystem
		return result
	}

	// 9. 상태 초기화 ---------------------------------------------------------------------------------------------
	private async hydrateState(): Promise<void> {
		this.saveWorkspaceSetting = vscode.workspace
			.getConfiguration(this.vsCodeExtensionConfigurationKey)
			.get(this.saveWorkspaceConfigurationSettingKey);

		const stored = (
			this.workspaceRoot
				? this.extensionContext.workspaceState.get<TypedDirectory[]>(this.storedBookmarksContextKey)
				: this.extensionContext.globalState.get<TypedDirectory[]>(this.storedBookmarksContextKey)
		) || [];

		const result = stored.sort(this.sortByDirThenExtThenName)
		this.bookmarkedDirectories = result
	}

	// 10. 북마크 저장 ---------------------------------------------------------------------------------------------
	private async saveBookmarks() {
		this.workspaceRoot
			? await this.extensionContext.workspaceState.update(
				this.storedBookmarksContextKey,
				this.bookmarkedDirectories
			)
			: await this.extensionContext.globalState.update(
				this.storedBookmarksContextKey,
				this.bookmarkedDirectories
			);
	}
}