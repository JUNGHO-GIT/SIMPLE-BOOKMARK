// commands/BookmarkCommand.ts

import * as vscode from "vscode";
import * as path from "path";
import type { BookmarkProvider } from "../providers/BookmarkProvider.js";
import type { BookmarkSystemItem } from "../models/BookmarkSystemItem.js";
import { validateFileName } from "../utils/BookmarkPathUtil.js";

// -----------------------------------------------------------------------------------------
export type BookmarkCommand = ReturnType<typeof createBookmarkCommand>;

export const createBookmarkCommand = (
	provider: BookmarkProvider,
	context: vscode.ExtensionContext
) => {
	let selectedBookmarks: BookmarkSystemItem[] = [];

	// 선택된 아이템 업데이트 -----------------------------------------------------------------
	const updateSelectedBookmark = (items: BookmarkSystemItem[]): void => {
		selectedBookmarks = items;
	};

	// 모든 명령어 등록 -----------------------------------------------------------------------
	const registerCommands = (): vscode.Disposable[] => ([
		registerRefreshCommand(),
		registerAddBookmarkCommand(),
		registerRemoveBookmarkCommand(),
		registerRenameBookmarkCommand(),
		registerCopyBookmarkCommand(),
		registerPasteBookmarkCommand(),
		registerPasteToRootBookmarkCommand(),
		registerDeleteAllBookmarkCommand(),
		registerCreateFolderCommand(),
		registerCreateFileCommand()
	]);

	// 북마크 새로고침 -------------------------------------------------------------------------
	const registerRefreshCommand = (): vscode.Disposable =>
	vscode.commands.registerCommand("Simple-Bookmark.refreshentry", () => {
		console.debug("[Simple-Bookmark.cmd.refresh]");
		provider.refresh();
	});

	// 북마크 추가 (Explorer 선택 기반) --------------------------------------------------------
	const registerAddBookmarkCommand = (): vscode.Disposable =>
	vscode.commands.registerCommand("Simple-Bookmark.addbookmark", async (uri?: vscode.Uri) => {
		if (!uri) {
			await vscode.commands.executeCommand("copyFilePath");
			const copied = await vscode.env.clipboard.readText();
			uri = copied ? vscode.Uri.file(copied.split(/\r?\n/)[0]) : undefined;
		}

		if (!uri) {
			vscode.window.showErrorMessage("No file or folder selected in Explorer.");
			return;
		}

		const stat = await vscode.workspace.fs.stat(uri);
		const bookmarkName = path.basename(uri.fsPath);

		if (stat.type === vscode.FileType.Directory || stat.type === vscode.FileType.File) {
			await provider.addBookmark(uri.fsPath, bookmarkName);
			provider.refresh();
		}
		else {
			vscode.window.showErrorMessage("Only files or folders can be added.");
		}
	});

	// 북마크 제거 (루트만) --------------------------------------------------------------------
	const registerRemoveBookmarkCommand = (): vscode.Disposable =>
	vscode.commands.registerCommand("Simple-Bookmark.removebookmark", async (item?: BookmarkSystemItem) => {
		let itemsToRemove: string[];

		if (item) {
			itemsToRemove = [item.originalPath];
		}
		else if (selectedBookmarks.length > 0) {
			itemsToRemove = selectedBookmarks
				.filter(i => provider.isRootBookmark(i.originalPath))
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
			await provider.removeBookmark(originalPath);
		}
		provider.refresh();

		const msg = itemsToRemove.length === 1 ? "Bookmark removed" : `${itemsToRemove.length} bookmarks removed`;
		vscode.window.showInformationMessage(msg);
	});

	// 북마크 이름 변경 (루트뿐 아니라 모든 상황에서 허용) -----------------------------------------
	const registerRenameBookmarkCommand = (): vscode.Disposable =>
	vscode.commands.registerCommand("Simple-Bookmark.renamebookmark", async (item?: BookmarkSystemItem) => {
		let target: BookmarkSystemItem | undefined = item || (selectedBookmarks.length > 0 ? selectedBookmarks[0] : undefined);

		if (!target) {
			vscode.window.showErrorMessage("No bookmark selected to rename.");
			return;
		}

		const currentName = target.bookmarkMetadata.bookmarkName;

		const newName = await vscode.window.showInputBox({
			prompt: "Enter new bookmark name",
			value: currentName,
			validateInput: (v: string) => validateFileName(v)
		});

		if (!newName) return;

		await provider.renameBookmark(target.originalPath, newName.trim());
		provider.refresh();
		vscode.window.showInformationMessage(`Bookmark renamed: ${currentName} → ${newName.trim()}`);
	});

	// 복사 ----------------------------------------------------------------------------------
	const registerCopyBookmarkCommand = (): vscode.Disposable =>
		vscode.commands.registerCommand("Simple-Bookmark.copybookmark", (item?: BookmarkSystemItem, selected?: BookmarkSystemItem[]) => {
			let targets: BookmarkSystemItem[] = [];

			if (Array.isArray(selected) && selected.length > 0) {
				targets = selected;
			}
			else if (selectedBookmarks.length > 0) {
				targets = selectedBookmarks;
			}
			else if (item) {
				targets = [item];
			}
			else {
				vscode.window.showErrorMessage("No items selected to copy.");
				return;
			}

			// 중복 제거 ----------------------------------------------------------------------
			const dedupMap = new Map<string, BookmarkSystemItem>();
			for (const t of targets) {
				if (!dedupMap.has(t.originalPath)) dedupMap.set(t.originalPath, t);
			}
			targets = Array.from(dedupMap.values());

			const available = targets.filter((t) => t.isOriginalAvailable);
			if (available.length === 0) {
				vscode.window.showWarningMessage("No available original files to copy.");
				return;
			}

			updateSelectedBookmark(available);
			provider.copyBookmarks(available);
			provider.refresh();
		});

	// 붙여넣기 -----------------------------------------------------------------------------
	const registerPasteBookmarkCommand = (): vscode.Disposable =>
	vscode.commands.registerCommand("Simple-Bookmark.pastebookmark", async (item?: BookmarkSystemItem) => {
		if (!provider.hasCopiedItems()) {
			vscode.window.showErrorMessage("No items to paste.");
			return;
		}

		if (!item && selectedBookmarks.length === 0) {
			await provider.pasteItemsToRoot();
			provider.refresh();
			return;
		}

		let targetPath: string | undefined;

		if (item) {
			updateSelectedBookmark([item]);
			targetPath = (!item.bookmarkMetadata.isFile && item.isOriginalAvailable)
				? item.originalPath
				: path.dirname(item.originalPath);
		}
		else if (selectedBookmarks.length > 0) {
			const folder = selectedBookmarks.find(s => !s.bookmarkMetadata.isFile && s.isOriginalAvailable);
			targetPath = folder ? folder.originalPath : path.dirname(selectedBookmarks[0].originalPath);
		}
		else {
			targetPath = provider.rootPath;
		}

		if (targetPath) {
			console.debug("[Simple-Bookmark.pastebookmark]", targetPath);
			await provider.pasteItems(targetPath);
			provider.refresh();
		}
		else {
			vscode.window.showWarningMessage("Select a valid target folder to paste into.");
		}
	});

	// 붙여넣기(루트 전용) -----------------------------------------------------------------
	const registerPasteToRootBookmarkCommand = (): vscode.Disposable =>
	vscode.commands.registerCommand("Simple-Bookmark.pasterootbookmark", async () => {
		if (!provider.hasCopiedItems()) {
			vscode.window.showErrorMessage("No items to paste.");
			return;
		}
		await provider.pasteItemsToRoot();
		provider.refresh();
	});

	// 모든 북마크 삭제 --------------------------------------------------------------------
	const registerDeleteAllBookmarkCommand = (): vscode.Disposable =>
	vscode.commands.registerCommand("Simple-Bookmark.removeallbookmark", async () => {
		const allItems = await provider.getChildren();

		if (allItems && allItems.length > 0) {
			for (const item of allItems) {
				await provider.removeBookmark(item.originalPath);
			}
			provider.refresh();
			vscode.window.showInformationMessage(`All ${allItems.length} bookmarks removed successfully`);
		}
		else {
			vscode.window.showInformationMessage("No bookmarks to remove.");
		}
	});

	// 폴더 생성 --------------------------------------------------------------------------
	const registerCreateFolderCommand = (): vscode.Disposable =>
	vscode.commands.registerCommand("Simple-Bookmark.createfolder", async (item?: BookmarkSystemItem) => {
		const folderName = await vscode.window.showInputBox({
			prompt: "Enter folder name (will be created in original location)",
			validateInput: validateFileName
		});

		if (!folderName) return;

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

			parentPath = folderUri && folderUri.length > 0 ? folderUri[0].fsPath : undefined;
		}

		if (parentPath) {
			await provider.createFolder(parentPath, folderName.trim());
			provider.refresh();
		}
		else {
			vscode.window.showWarningMessage("Please select a valid parent folder.");
		}
	});

	// 파일 생성 --------------------------------------------------------------------------
	const registerCreateFileCommand = (): vscode.Disposable =>
	vscode.commands.registerCommand("Simple-Bookmark.createfile", async (item?: BookmarkSystemItem) => {
		const fileName = await vscode.window.showInputBox({
			prompt: "Enter file name (will be created in original location)",
			validateInput: validateFileName
		});

		if (!fileName) return;

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

			parentPath = folderUri && folderUri.length > 0 ? folderUri[0].fsPath : undefined;
		}

		if (parentPath) {
			await provider.createFile(parentPath, fileName.trim());
			provider.refresh();
		}
		else {
			vscode.window.showWarningMessage("Please select a valid parent folder.");
		}
	});

	return {
		updateSelectedBookmark,
		registerCommands
	};
};
