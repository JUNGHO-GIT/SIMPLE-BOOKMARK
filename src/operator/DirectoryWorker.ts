import * as vscode from "vscode";
import * as path from "path";
import { FileSystemObject } from "../types/FileSystemObject";
import { TypedDirectory, buildTypedDirectory } from "../types/TypedDirectory";

export class DirectoryWorker {
    readonly vsCodeExtensionConfigurationKey: string = "JEXPLORER";
    readonly saveWorkspaceConfigurationSettingKey: string = "saveWorkspace";
    readonly storedBookmarksContextKey: string = "storedBookmarks";
    readonly bookmarkedDirectoryContextValue: string = "directlyBookmarkedDirectory"
    bookmarkedDirectories: TypedDirectory[] = [];
    saveWorkspaceSetting: boolean | undefined = false;

    constructor(
        private extensionContext: vscode.ExtensionContext,
        private workspaceRoot: readonly vscode.WorkspaceFolder[] | undefined
    ) {
        this.hydrateState();
    }

    public async getChildren(element?: FileSystemObject): Promise<FileSystemObject[]> {
        if (element) {
            // 특정 폴더의 하위 항목을 불러올 때
            return await this.directorySearch(element.resourceUri);
        }
        else {
            // 최상위 북마크 목록을 불러올 때
            if (this.bookmarkedDirectories.length > 0) {
                // 북마크된 디렉토리 목록을 가져와 FileSystemObject로 변환하기 전에 정렬
                const sortedBookmarks = [...this.bookmarkedDirectories].sort((a, b) => {
                    // 폴더를 파일보다 먼저 정렬 (오름차순: A-Z)
                    if (a.type === vscode.FileType.Directory && b.type !== vscode.FileType.Directory) {
                        return -1;
                    }
                    if (a.type !== vscode.FileType.Directory && b.type === vscode.FileType.Directory) {
                        return 1;
                    }
                    // 같은 타입이면 이름순으로 정렬
                    return path.basename(a.path).localeCompare(path.basename(b.path));
                });
                return this.createEntries(sortedBookmarks);
            } else {
                return Promise.resolve([]);
            }
        }
    }

    public async selectItem(uri: vscode.Uri | undefined) {
        if (uri) {
            this.bookmarkedDirectories.push(await buildTypedDirectory(uri));
        }
        // 아이템 추가 후 바로 정렬된 상태로 저장
        this.bookmarkedDirectories.sort((a, b) => {
            if (a.type === vscode.FileType.Directory && b.type !== vscode.FileType.Directory) {
                return -1;
            }
            if (a.type !== vscode.FileType.Directory && b.type === vscode.FileType.Directory) {
                return 1;
            }
            return path.basename(a.path).localeCompare(path.basename(b.path));
        });
        this.saveBookmarks();
    }

    public async removeItem(uri: vscode.Uri | undefined) {
		console.log("removeItem called with uri:", uri?.toString());
        if (uri) {
            const typedDirectory = await buildTypedDirectory(uri);
            const index =
                this.bookmarkedDirectories.map(e => e.path)
                    .indexOf(typedDirectory.path);
            if (index > -1) {
                this.bookmarkedDirectories.splice(index, 1);
            }
        }
        this.saveBookmarks();
    }

    public removeAllItems() {
        this.bookmarkedDirectories = [];
        this.saveBookmarks();
    }

    private async directorySearch(uri: vscode.Uri) {
        const entries = await vscode.workspace.fs.readDirectory(uri);
        return entries
            .sort((a, b) => {
                // 폴더를 파일보다 먼저 오도록 정렬 (하위 항목)
                const isADirectory = a[1] === vscode.FileType.Directory;
                const isBDirectory = b[1] === vscode.FileType.Directory;

                if (isADirectory && !isBDirectory) {
                    return -1;
                }
                if (!isADirectory && isBDirectory) {
                    return 1;
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
    }

    private async createEntries(bookmarkedDirectories: TypedDirectory[]) {
        let fileSystem: FileSystemObject[] = [];

        // 이미 정렬된 bookmarkedDirectories를 사용하므로 여기서 다시 정렬할 필요 없음
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

        return fileSystem;
    }

    private hydrateState(): void {
        this.saveWorkspaceSetting = vscode.workspace
            .getConfiguration(this.vsCodeExtensionConfigurationKey)
            .get(this.saveWorkspaceConfigurationSettingKey);

        // 저장된 북마크를 불러올 때도 초기 정렬을 적용합니다.
        const stored = (this.workspaceRoot
            ? this.extensionContext.workspaceState.get<TypedDirectory[]>(this.storedBookmarksContextKey)
            : this.extensionContext.globalState.get<TypedDirectory[]>(this.storedBookmarksContextKey)) || [];

        this.bookmarkedDirectories = stored.sort((a, b) => {
            if (a.type === vscode.FileType.Directory && b.type !== vscode.FileType.Directory) {
                return -1;
            }
            if (a.type !== vscode.FileType.Directory && b.type === vscode.FileType.Directory) {
                return 1;
            }
            return path.basename(a.path).localeCompare(path.basename(b.path));
        });
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