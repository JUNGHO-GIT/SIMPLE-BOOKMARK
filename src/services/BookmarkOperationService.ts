// services/BookmarkOperationService.ts

import * as vscode from "vscode";
import * as path from "path";
import {type BookmarkSyncService} from "./BookmarkSyncService.js";
import {validateFileName} from "../utils/BookmarkPathUtil.js";
import {showInfoAuto, showErrorAuto, showWarnAuto} from "../utils/NotificationUtil.js";

// -----------------------------------------------------------------------------------------
export type BookmarkOperationService = ReturnType<typeof createBookmarkOperationService>;

// -----------------------------------------------------------------------------------------
export const createBookmarkOperationService = (
	bookmarkPath : string,
	syncService? : BookmarkSyncService
) => {

	// -----------------------------------------------------------------------------------------
	const fnFlattenToFiles = async (uri: vscode.Uri): Promise<string[]> => {
		const stat = await vscode.workspace.fs.stat(uri);
		return stat.type === vscode.FileType.File
		? [uri.fsPath]
		: await (async () => {
			const out: string[] = [];
			const entries = await vscode.workspace.fs.readDirectory(uri);
			for (const [name] of entries) {
				const child = vscode.Uri.file(path.join(uri.fsPath, name));
				const childStat = await vscode.workspace.fs.stat(child);
				childStat.type === vscode.FileType.File
					? out.push(child.fsPath)
					: (await fnFlattenToFiles(child)).forEach((p) => out.push(p));
			}
			return out;
		})();
	};

	// -----------------------------------------------------------------------------------------
	const fnCopyFileOrFolder = async (source: string, target: string): Promise<void> => {
		const srcUri = vscode.Uri.file(source);
		const tgtUri = vscode.Uri.file(target);
		const stat = await vscode.workspace.fs.stat(srcUri);

		stat.type === vscode.FileType.File ? await (async () => {
			const content = await vscode.workspace.fs.readFile(srcUri);
			await vscode.workspace.fs.writeFile(tgtUri, content);
		})() : await (async () => {
			try {
				await vscode.workspace.fs.delete(tgtUri, {recursive: true});
			}
			catch {
			}

			await vscode.workspace.fs.createDirectory(tgtUri);
			const entries = await vscode.workspace.fs.readDirectory(srcUri);

			const copyPromises = entries.map(([name]) => {
				const sourcePath = path.join(source, name);
				const targetPath = path.join(target, name);
				return fnCopyFileOrFolder(sourcePath, targetPath);
			});

			await Promise.all(copyPromises);
		})();
	};

	// 파일/폴더 붙여넣기 (강제 덮어쓰기) - 일반 폴더 대상 ---------------------------------------
	const pasteItems = async (
		copiedItems : vscode.Uri[],
		targetPath : string
	) : Promise<void> => {
		const proceed = copiedItems.length > 0;

		return !proceed
		? showErrorAuto("[Simple-Bookmark] No items to paste.")
		: await (async () => {
			let pasteCount = 0;

			for (const item of copiedItems) {
				const fileName = path.basename(item.fsPath);
				const targetFile = path.join(targetPath, fileName);
				const targetUri = vscode.Uri.file(targetFile);

				path.resolve(item.fsPath) === path.resolve(targetFile)
				? console.debug("[Simple-Bookmark.pasteItems]", item.fsPath)
				: await (async () => {
					try {
						await vscode.workspace.fs.stat(targetUri);
						await vscode.workspace.fs.delete(targetUri, {recursive : true, useTrash : false});
						await fnCopyFileOrFolder(item.fsPath, targetFile);
						pasteCount++;
					}
					catch (error) {
						showErrorAuto(`[Simple-Bookmark] Paste failed for ${fileName}: ${error}`);
					}
				})();
			}

			const message = pasteCount === 1
			? "[Simple-Bookmark] Item pasted (overwritten)"
			: `[Simple-Bookmark] ${pasteCount} items pasted (overwritten)`;
			showInfoAuto(message);
			console.debug("[Simple-Bookmark.pasteItems.count]", pasteCount);
		})();
	};

	// 루트 붙여넣기: 파일명 매칭 → 각 북마크의 실제 경로에 덮어쓰기 ----------------------------
	const pasteItemsToRoot = async (
		copiedItems : vscode.Uri[],
		nameToOriginalPath : Map<string, string>
	) : Promise<void> => {
		const proceed = copiedItems.length > 0;

		return !proceed
		? showErrorAuto("[Simple-Bookmark] No items to paste.")
		: await (async () => {

			const srcFilesSet = new Set<string>();
			for (const uri of copiedItems) {
				(await fnFlattenToFiles(uri)).forEach((f: string) => srcFilesSet.add(f));
			}
			const srcFiles = Array.from(srcFilesSet.values());

			let overwriteCount = 0;
			const skipped : string[] = [];

			for (const src of srcFiles) {
				const fileName = path.basename(src);
				const realTarget = nameToOriginalPath.get(fileName);

				!realTarget
				? skipped.push(fileName)
				: (path.resolve(src) === path.resolve(realTarget)
					? console.debug("[Simple-Bookmark.pasteItemsToRoot]", src)
					: await (async () => {
						try {
							await vscode.workspace.fs.stat(vscode.Uri.file(realTarget));
							await vscode.workspace.fs.delete(vscode.Uri.file(realTarget), {recursive : true, useTrash : false});
							await fnCopyFileOrFolder(src, realTarget);
							overwriteCount++;
						}
						catch (error) {
							showErrorAuto(`[Simple-Bookmark] Root overwrite failed for ${fileName}: ${error}`);
						}
					})()
				);
			}

			overwriteCount > 0 && showInfoAuto(
				overwriteCount === 1
				? "[Simple-Bookmark] 1 file overwritten to original targets"
				: `[Simple-Bookmark] ${overwriteCount} files overwritten to original targets`
			);
			skipped.length > 0 && console.debug("[Simple-Bookmark] Skipped (non-matching names):", skipped);
		})();
	};

	// 실제 원본 파일/폴더 삭제 -------------------------------------------------------------
	const deleteOriginalFiles = async (
		items : vscode.Uri[]
	) : Promise<void> => {
		let deleteCount = 0;

		for (const item of items) {
			try {
				await vscode.workspace.fs.delete(item, {recursive : true});
				deleteCount++;
				console.debug("[Simple-Bookmark.deleteOriginalFiles]", item.fsPath);
			}
			catch (error) {
				console.error(`[Simple-Bookmark] Failed to delete original file: ${item.fsPath}`, error);
			}
		}

		const successMessage = deleteCount === 1
		? "[Simple-Bookmark] Original file deleted"
		: `[Simple-Bookmark] ${deleteCount} original files deleted`;

		showInfoAuto(successMessage);
	};

	// 실제 위치에 새 폴더 생성 -------------------------------------------------------------
	const createFolder = async (
		parentPath : string,
		folderName : string
	) : Promise<void> => {
		const error = validateFileName(folderName);

		return error
		? void showErrorAuto(`[Simple-Bookmark] ${error}`)
		: await (async () => {
			const folderPath = path.join(parentPath, folderName);
			const folderUri = vscode.Uri.file(folderPath);
			let exists = true;
			try {
				await vscode.workspace.fs.stat(folderUri);
			}
			catch {
				exists = false;
			}
			exists
			? showWarnAuto(`[Simple-Bookmark] Folder already exists: ${folderName}`)
			: await (async () => {
				await vscode.workspace.fs.createDirectory(folderUri);
				showInfoAuto(`[Simple-Bookmark] Folder created in original location: ${folderName}`);
				console.debug("[Simple-Bookmark.createFolder]", folderPath);
			})();
		})();
	};

	// 실제 위치에 새 파일 생성 ---------------------------------------------------------------
	const createFile = async (
		parentPath : string,
		fileName : string
	) : Promise<void> => {
		const error = validateFileName(fileName);

		return error
		? void showErrorAuto(`[Simple-Bookmark] ${error}`)
		: await (async () => {
			const filePath = path.join(parentPath, fileName);
			await vscode.workspace.fs.writeFile(vscode.Uri.file(filePath), new Uint8Array(0));
			showInfoAuto(`[Simple-Bookmark] File created in original location: ${fileName}`);
			console.debug("[Simple-Bookmark.createFile]", filePath);

			try {
				const document = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
				await vscode.window.showTextDocument(document);
			}
			catch (e) {
				console.error(`[Simple-Bookmark] Failed to open created file: ${e}`);
			}
		})();
	};

	// 파일 변경 감지 (존재 여부 확인) ----------------------------------------------------
	const checkForChanges = async (
		filePaths : string[]
	) : Promise<string[]> => {
		const changedFiles : string[] = [];

		for (const filePath of filePaths) {
			try {
				await vscode.workspace.fs.stat(vscode.Uri.file(filePath));
			}
			catch {
				changedFiles.push(filePath);
			}
		}

		return changedFiles;
	};

	// 북마크 폴더 경로 업데이트 -----------------------------------------------------------
	const updateBookmarkPath = (
		newPath : string
	) : void => {
		bookmarkPath = newPath;
	};

	// 리턴 ----------------------------------------------------------------------------
	return {
		pasteItems,
		pasteItemsToRoot,
		deleteOriginalFiles,
		createFolder,
		createFile,
		checkForChanges,
		updateBookmarkPath,
	};
};
