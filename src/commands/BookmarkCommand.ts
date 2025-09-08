// BookmarkCommand.ts

import * as vscode from "vscode";
import * as path from "path";
import {BookmarkProvider} from "../providers/BookmarkProvider.js";
import {BookmarkSystemItem} from "../models/BookmarkSystemItem.js";
import {BookmarkPathUtil} from "../utils/BookmarkPathUtil.js";

// -------------------------------------------------------------------------------------------------------------
export class BookmarkCommand {
	private selectedItems: BookmarkSystemItem[] = [];
	constructor (
		private provider: BookmarkProvider,
		private context: vscode.ExtensionContext
	) {}

	// ---------------------------------------------------------------------------------------------
	// 선택된 아이템 업데이트
	updateSelectedItems (items: BookmarkSystemItem[]): void {
		this.selectedItems = items;
	}

	// ---------------------------------------------------------------------------------------------
	// 모든 명령어 등록
	registerCommands (): vscode.Disposable[] {
		return [
			this.registerRefreshCommand(),
			this.registerAddBookmarkCommand(),
			this.registerRemoveBookmarkCommand(),
			this.registerCopyCommand(),
			this.registerPasteCommand(),
			this.registerPasteToRootCommand(),
			this.registerDeleteBookmarkCommand(),
			this.registerDeleteAllBookmarksCommand(),
			this.registerCreateFolderCommand(),
			this.registerCreateFileCommand()
		];
	}

	// ---------------------------------------------------------------------------------------------
	// 북마크 새로고침
	private registerRefreshCommand (): vscode.Disposable {
		return vscode.commands.registerCommand("JEXPLORER.refreshentry", () => {
			this.provider.refresh();
		});
	}

	// ---------------------------------------------------------------------------------------------
	// 북마크 추가 (Explorer 선택 기반)
	private registerAddBookmarkCommand (): vscode.Disposable {
		return vscode.commands.registerCommand("JEXPLORER.additem", async (uri?: vscode.Uri) => {
			if (!uri) {
				await vscode.commands.executeCommand("copyFilePath");
				const copied = await vscode.env.clipboard.readText();
				if (copied) {
					uri = vscode.Uri.file(copied.split(/\r?\n/)[0]);
				}
			}

			if (!uri) {
				vscode.window.showErrorMessage("No file or folder selected in Explorer.");
				return;
			}

			const stat = await vscode.workspace.fs.stat(uri);
			const bookmarkName = path.basename(uri.fsPath);

			if (stat.type === vscode.FileType.Directory || stat.type === vscode.FileType.File) {
				await this.provider.addBookmark(uri.fsPath, bookmarkName);
				this.provider.refresh();
			}
			else {
				vscode.window.showErrorMessage("Only files or folders can be added.");
			}
		});
	}

	// ---------------------------------------------------------------------------------------------
	// 북마크 제거 (선택 아이템 또는 루트만)
	private registerRemoveBookmarkCommand (): vscode.Disposable {
		return vscode.commands.registerCommand("JEXPLORER.removebookmark", async (item?: BookmarkSystemItem) => {
			let itemsToRemove: string[];

			if (item) {
				itemsToRemove = [item.originalPath];
			}
			else if (this.selectedItems.length > 0) {
				itemsToRemove = this.selectedItems
					.filter(i => this.provider.isRootBookmark(i.originalPath))
					.map(i => i.originalPath);
			}
			else {
				vscode.window.showErrorMessage("No bookmarks selected to remove.");
				return;
			}

			if (itemsToRemove.length === 0) {
				vscode.window.showWarningMessage("Only root-level bookmarks can be removed.");
				return;
			}

			for (const originalPath of itemsToRemove) {
				await this.provider.removeBookmark(originalPath);
			}
			this.provider.refresh();
		});
	}

	// ---------------------------------------------------------------------------------------------
	// 북마크만 삭제 (컨텍스트 메뉴 전용)
	private registerDeleteBookmarkCommand (): vscode.Disposable {
		return vscode.commands.registerCommand("JEXPLORER.removeitem", async (item?: BookmarkSystemItem) => {
			let itemsToRemove: BookmarkSystemItem[];

			if (item) {
				itemsToRemove = [item];
			}
			else if (this.selectedItems.length > 0) {
				itemsToRemove = this.selectedItems;
			}
			else {
				vscode.window.showErrorMessage("No bookmarks selected to remove.");
				return;
			}

			for (const it of itemsToRemove) {
				await this.provider.removeBookmark(it.originalPath);
			}

			this.provider.refresh();

			const message = itemsToRemove.length === 1
				? "Bookmark removed successfully"
				: `${itemsToRemove.length} bookmarks removed successfully`;
			vscode.window.showInformationMessage(message);
		});
	}

	// ---------------------------------------------------------------------------------------------
	// 모든 북마크 삭제
	private registerDeleteAllBookmarksCommand (): vscode.Disposable {
		return vscode.commands.registerCommand("JEXPLORER.removeallitems", async () => {
			const allItems = await this.provider.getChildren();

			if (allItems && allItems.length > 0) {
				for (const item of allItems) {
					await this.provider.removeBookmark(item.originalPath);
				}
				this.provider.refresh();
				vscode.window.showInformationMessage(`All ${allItems.length} bookmarks removed successfully`);
			}
			else {
				vscode.window.showInformationMessage("No bookmarks to remove.");
			}
		});
	}

	// ---------------------------------------------------------------------------------------------
	// 복사
	private registerCopyCommand (): vscode.Disposable {
		return vscode.commands.registerCommand(
			"JEXPLORER.copyitem",
			(item?: BookmarkSystemItem, selected?: BookmarkSystemItem[]) => {
				let targets: BookmarkSystemItem[] = [];

				if (Array.isArray(selected) && selected.length > 0) {
					targets = selected;
				}
				else if (this.selectedItems.length > 0) {
					targets = this.selectedItems;
				}
				else if (item) {
					targets = [item];
				}
				else {
					vscode.window.showErrorMessage("No items selected to copy.");
					return;
				}

				// 중복 제거
				const dedupMap = new Map<string, BookmarkSystemItem>();
				for (const t of targets) {
					if (!dedupMap.has(t.originalPath)) {
						dedupMap.set(t.originalPath, t);
					}
				}
				targets = Array.from(dedupMap.values());

				const available = targets.filter((t) => t.isOriginalAvailable);
				if (available.length === 0) {
					vscode.window.showWarningMessage("No available original files to copy.");
					return;
				}

				this.updateSelectedItems(available);
				this.provider.copyItems(available);
				this.provider.refresh();
			}
		);
	}

	// ---------------------------------------------------------------------------------------------
	// 붙여넣기
	// - 아이템 지정 없음: 루트 매칭 덮어쓰기
	// - 아이템 컨텍스트: 해당 위치로 붙여넣기
	private registerPasteCommand (): vscode.Disposable {
		return vscode.commands.registerCommand("JEXPLORER.pasteitem", async (item?: BookmarkSystemItem) => {
			if (!this.provider.hasCopiedItems()) {
				vscode.window.showErrorMessage("No items to paste.");
				return;
			}

			if (!item && this.selectedItems.length === 0) {
				await this.provider.pasteItemsToRoot();
				this.provider.refresh();
				return;
			}

			let targetPath: string | undefined;

			if (item) {
				this.updateSelectedItems([item]);
				if (!item.bookmarkMetadata.isFile && item.isOriginalAvailable) {
					targetPath = item.originalPath;
				}
				else {
					targetPath = path.dirname(item.originalPath);
				}
			}
			else if (this.selectedItems.length > 0) {
				const folder = this.selectedItems.find(s => !s.bookmarkMetadata.isFile && s.isOriginalAvailable);
				targetPath = folder ? folder.originalPath : path.dirname(this.selectedItems[0].originalPath);
			}
			else {
				targetPath = this.provider.rootPath;
			}

			if (targetPath) {
				console.debug(`[JEXPLORER.pasteitem] `, JSON.stringify(targetPath, null, 2));
				await this.provider.pasteItems(targetPath);
				this.provider.refresh();
			}
			else {
				vscode.window.showWarningMessage("Select a valid target folder to paste into.");
			}
		});
	}

	// ---------------------------------------------------------------------------------------------
	// 붙여넣기(루트 전용)
	private registerPasteToRootCommand (): vscode.Disposable {
		return vscode.commands.registerCommand("JEXPLORER.pasteroot", async () => {
			if (!this.provider.hasCopiedItems()) {
				vscode.window.showErrorMessage("No items to paste.");
				return;
			}
			await this.provider.pasteItemsToRoot();
			this.provider.refresh();
		});
	}

	// ---------------------------------------------------------------------------------------------
	// 폴더 생성
	private registerCreateFolderCommand (): vscode.Disposable {
		return vscode.commands.registerCommand("JEXPLORER.createfolder", async (item?: BookmarkSystemItem) => {
			const folderName = await vscode.window.showInputBox({
				prompt: "Enter folder name (will be created in original location)",
				validateInput: BookmarkPathUtil.validateFileName
			});

			if (!folderName) {
				return;
			}

			let parentPath: string | undefined;

			if (item && !item.bookmarkMetadata.isFile && item.isOriginalAvailable) {
				parentPath = item.originalPath;
			}
			else {
				const folderUri = await vscode.window.showOpenDialog({
					canSelectFiles: false,
					canSelectFolders: true,
					canSelectMany: false,
					openLabel: "Select Parent Folder"
				});

				if (folderUri && folderUri.length > 0) {
					parentPath = folderUri[0].fsPath;
				}
			}

			if (parentPath) {
				await this.provider.createFolder(parentPath, folderName.trim());
				this.provider.refresh();
			}
			else {
				vscode.window.showWarningMessage("Please select a valid parent folder.");
			}
		});
	}

	// ---------------------------------------------------------------------------------------------
	// 파일 생성
	private registerCreateFileCommand (): vscode.Disposable {
		return vscode.commands.registerCommand("JEXPLORER.createfile", async (item?: BookmarkSystemItem) => {
			const fileName = await vscode.window.showInputBox({
				prompt: "Enter file name (will be created in original location)",
				validateInput: BookmarkPathUtil.validateFileName
			});

			if (!fileName) {
				return;
			}

			let parentPath: string | undefined;

			if (item && !item.bookmarkMetadata.isFile && item.isOriginalAvailable) {
				parentPath = item.originalPath;
			}
			else {
				const folderUri = await vscode.window.showOpenDialog({
					canSelectFiles: false,
					canSelectFolders: true,
					canSelectMany: false,
					openLabel: "Select Parent Folder"
				});

				if (folderUri && folderUri.length > 0) {
					parentPath = folderUri[0].fsPath;
				}
			}

			if (parentPath) {
				await this.provider.createFile(parentPath, fileName.trim());
				this.provider.refresh();
			}
			else {
				vscode.window.showWarningMessage("Please select a valid parent folder.");
			}
		});
	}
}
