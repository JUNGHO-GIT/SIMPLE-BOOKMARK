import * as vscode from "vscode";
import * as path from "path";
import { FileSystemObject } from "../types/FileSystemObject";
import { TypedDirectory, buildTypedDirectory } from "../types/TypedDirectory";

export class DirectoryWorker {
    readonly vsCodeExtensionConfigurationKey: string = "JEXPLORER";
    readonly saveWorkspaceConfigurationSettingKey: string = "saveWorkspace";
    readonly storedBookmarksContextKey: string = "storedBookmarks";
    readonly bookmarkedDirectoryContextValue: string = "directlyBookmarkedDirectory";
    bookmarkedDirectories: TypedDirectory[] = [];
    saveWorkspaceSetting: boolean | undefined = false;

    constructor(
        private extensionContext: vscode.ExtensionContext,
        private workspaceRoot: readonly vscode.WorkspaceFolder[] | undefined
    ) {
        this.hydrateState();
    }

    // 폴더 우선, 파일은 확장자 → 이름 순 정렬 함수
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

    public async getChildren(element?: FileSystemObject): Promise<FileSystemObject[]> {
        if (element) {
            const result = await this.directorySearch(element.resourceUri);
            return result
        }
        else {
            if (this.bookmarkedDirectories.length > 0) {
                const sortedBookmarks = [...this.bookmarkedDirectories].sort(this.sortByDirThenExtThenName);
                const result = await this.createEntries(sortedBookmarks);
                return result
            } else {
                const result: FileSystemObject[] = [];
                return result
            }
        }
    }

    public async selectItem(uri: vscode.Uri | undefined) {
        if (uri) {
            this.bookmarkedDirectories.push(await buildTypedDirectory(uri));
        }
        this.bookmarkedDirectories.sort(this.sortByDirThenExtThenName);
        this.saveBookmarks();
    }

    public async removeItem(uri: string) {
        const targetPath = uri.toLowerCase();
        const index = this.bookmarkedDirectories.findIndex(bookmark => {
            const bookmarkPath = vscode.Uri.file(bookmark.path).fsPath.toLowerCase();
            return bookmarkPath === targetPath;
        });

        if (index > -1) {
            this.bookmarkedDirectories.splice(index, 1);
        } else {
            console.warn("Bookmark not found for deletion:", targetPath);
        }
        this.saveBookmarks();
    }

    public removeAllItems() {
        this.bookmarkedDirectories = [];
        this.saveBookmarks();
    }

    private async directorySearch(uri: vscode.Uri) {
        const entries = await vscode.workspace.fs.readDirectory(uri);
        const result = entries.sort((a, b) => {
			// 폴더 우선
			const isADir = a[1] === vscode.FileType.Directory;
			const isBDir = b[1] === vscode.FileType.Directory;
			if (isADir && !isBDir) {
				return -1;
			}
			if (!isADir && isBDir) {
				return 1;
			}
			// 둘 다 파일이면 확장자 > 이름
			if (!isADir && !isBDir) {
				const extA = path.extname(a[0]).toLowerCase();
				const extB = path.extname(b[0]).toLowerCase();
				if (extA !== extB) {
					return extA.localeCompare(extB);
				}
				return a[0].localeCompare(b[0]);
			}
			// 둘 다 폴더면 이름
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

    private hydrateState(): void {
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

    private saveBookmarks() {
        this.workspaceRoot
		? this.extensionContext.workspaceState.update(
			this.storedBookmarksContextKey,
			this.bookmarkedDirectories
		)
		: this.extensionContext.globalState.update(
			this.storedBookmarksContextKey,
			this.bookmarkedDirectories
		);
    }
}
