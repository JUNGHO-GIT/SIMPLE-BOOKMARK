// BookmarkOperationService.ts

import * as vscode from "vscode";
import * as path from "path";
import {BookmarkSyncService} from "./BookmarkSyncService.js";
import {BookmarkPathUtil} from "../utils/BookmarkPathUtil.js";

// -------------------------------------------------------------------------------------------------------------
export class BookmarkOperationService {
	constructor (
		private bookmarkPath: string,
		private syncService?: BookmarkSyncService
	) {}

	// ---------------------------------------------------------------------------------------------
	// 유틸: 폴더를 파일 목록으로 평탄화
	private async flattenToFiles (uri: vscode.Uri): Promise<string[]> {
		const stat = await vscode.workspace.fs.stat(uri);

		if (stat.type === vscode.FileType.File) {
			return [uri.fsPath];
		}

		const out: string[] = [];
		const entries = await vscode.workspace.fs.readDirectory(uri);
		for (const [name] of entries) {
			const child = vscode.Uri.file(path.join(uri.fsPath, name));
			const childStat = await vscode.workspace.fs.stat(child);
			if (childStat.type === vscode.FileType.File) {
				out.push(child.fsPath);
			}
			else {
				const nested = await this.flattenToFiles(child);
				for (const p of nested) {
					out.push(p);
				}
			}
		}
		return out;
	}

	// ---------------------------------------------------------------------------------------------
	// 파일/폴더 재귀적 복사
	async copyFileOrFolder (source: string, target: string): Promise<void> {
		const stat = await vscode.workspace.fs.stat(vscode.Uri.file(source));

		if (stat.type === vscode.FileType.File) {
			const content = await vscode.workspace.fs.readFile(vscode.Uri.file(source));
			await vscode.workspace.fs.writeFile(vscode.Uri.file(target), content);
		}
		else {
			try {
				await vscode.workspace.fs.stat(vscode.Uri.file(target));
				await vscode.workspace.fs.delete(vscode.Uri.file(target), {recursive: true});
			}
			catch {
			}

			await vscode.workspace.fs.createDirectory(vscode.Uri.file(target));
			const entries = await vscode.workspace.fs.readDirectory(vscode.Uri.file(source));

			for (const [name] of entries) {
				const sourcePath = path.join(source, name);
				const targetPath = path.join(target, name);
				await this.copyFileOrFolder(sourcePath, targetPath);
			}
		}
	}

	// ---------------------------------------------------------------------------------------------
	// 파일/폴더 붙여넣기 (강제 덮어쓰기) - 일반 폴더 대상
	async pasteItems (copiedItems: vscode.Uri[], targetPath: string): Promise<void> {
		if (copiedItems.length === 0) {
			vscode.window.showErrorMessage("No items to paste.");
			return;
		}

		let pasteCount = 0;

		for (const item of copiedItems) {
			const fileName = path.basename(item.fsPath);
			const targetFile = path.join(targetPath, fileName);
			const targetUri = vscode.Uri.file(targetFile);

			// 자기 자신에 대한 붙여넣기 방지
			if (path.resolve(item.fsPath) === path.resolve(targetFile)) {
				console.debug(`[JEXPLORER.pasteItems] `, JSON.stringify(item.fsPath, null, 2));
				continue;
			}

			try {
				try {
					await vscode.workspace.fs.stat(targetUri);
					await vscode.workspace.fs.delete(targetUri, {recursive: true, useTrash: false});
				}
				catch {
				}

				await this.copyFileOrFolder(item.fsPath, targetFile);
				pasteCount++;
			}
			catch (error) {
				vscode.window.showErrorMessage(`Paste failed for ${fileName}: ${error}`);
			}
		}

		const message = pasteCount === 1
			? "Item pasted (overwritten)"
			: `${pasteCount} items pasted (overwritten)`;
		vscode.window.showInformationMessage(message);
	}

	// ---------------------------------------------------------------------------------------------
	// 루트 붙여넣기: 파일명 매칭 → 각 북마크의 실제 경로에 덮어쓰기
	async pasteItemsToRoot (copiedItems: vscode.Uri[], nameToOriginalPath: Map<string, string>): Promise<void> {
		if (copiedItems.length === 0) {
			vscode.window.showErrorMessage("No items to paste.");
			return;
		}

		// 폴더가 포함되어도 파일 단위로 매칭되도록 평탄화
		const srcFilesSet = new Set<string>();
		for (const uri of copiedItems) {
			const files = await this.flattenToFiles(uri);
			for (const f of files) {
				srcFilesSet.add(f);
			}
		}
		const srcFiles = Array.from(srcFilesSet.values());

		let overwriteCount = 0;
		let skipped: string[] = [];

		for (const src of srcFiles) {
			const fileName = path.basename(src);
			const realTarget = nameToOriginalPath.get(fileName);

			if (!realTarget) {
				skipped.push(fileName);
				continue;
			}

			if (path.resolve(src) === path.resolve(realTarget)) {
				console.debug(`[JEXPLORER.pasteItemsToRoot] `, JSON.stringify(src, null, 2));
				continue;
			}

			try {
				try {
					await vscode.workspace.fs.stat(vscode.Uri.file(realTarget));
					await vscode.workspace.fs.delete(vscode.Uri.file(realTarget), {recursive: true, useTrash: false});
				}
				catch {
				}

				await this.copyFileOrFolder(src, realTarget);
				overwriteCount++;
			}
			catch (error) {
				vscode.window.showErrorMessage(`Root overwrite failed for ${fileName}: ${error}`);
			}
		}

		if (overwriteCount > 0) {
			const msg = overwriteCount === 1
				? "1 file overwritten to original targets"
				: `${overwriteCount} files overwritten to original targets`;
			vscode.window.showInformationMessage(msg);
		}
		if (skipped.length > 0) {
			console.debug(`[JEXPLORER skipped(non-matching names)]: `, JSON.stringify(skipped, null, 2));
		}
	}

	// ---------------------------------------------------------------------------------------------
	// 실제 원본 파일/폴더 삭제
	async deleteOriginalFiles (items: vscode.Uri[]): Promise<void> {
		let deleteCount = 0;

		for (const item of items) {
			try {
				await vscode.workspace.fs.delete(item, {recursive: true});
				deleteCount++;
				console.debug(`[JEXPLORER.deleteOriginalFiles] `, JSON.stringify(item.fsPath, null, 2));
			}
			catch (error) {
				console.error(`Failed to delete original file: ${item.fsPath}`, error);
			}
		}

		const successMessage = deleteCount === 1
			? "Original file deleted"
			: `${deleteCount} original files deleted`;
		vscode.window.showInformationMessage(successMessage);
	}

	// ---------------------------------------------------------------------------------------------
	// 실제 위치에 새 폴더 생성
	async createFolder (parentPath: string, folderName: string): Promise<void> {
		const error = BookmarkPathUtil.validateFileName(folderName);
		if (error) {
			vscode.window.showErrorMessage(error);
			return;
		}

		const folderPath = path.join(parentPath, folderName);

		try {
			await vscode.workspace.fs.stat(vscode.Uri.file(folderPath));
			await vscode.workspace.fs.delete(vscode.Uri.file(folderPath), {recursive: true});
		}
		catch {
		}

		await vscode.workspace.fs.createDirectory(vscode.Uri.file(folderPath));

		vscode.window.showInformationMessage(`Folder created in original location: ${folderName}`);
		console.debug(`[JEXPLORER.createFolder] `, JSON.stringify(folderPath, null, 2));
	}

	// ---------------------------------------------------------------------------------------------
	// 실제 위치에 새 파일 생성
	async createFile (parentPath: string, fileName: string): Promise<void> {
		const error = BookmarkPathUtil.validateFileName(fileName);
		if (error) {
			vscode.window.showErrorMessage(error);
			return;
		}

		const filePath = path.join(parentPath, fileName);

		await vscode.workspace.fs.writeFile(vscode.Uri.file(filePath), new Uint8Array(0));

		vscode.window.showInformationMessage(`File created in original location: ${fileName}`);
		console.debug(`[JEXPLORER.createFile] `, JSON.stringify(filePath, null, 2));

		try {
			const document = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
			await vscode.window.showTextDocument(document);
		}
		catch (error) {
			console.error(`Failed to open created file: ${error}`);
		}
	}

	// ---------------------------------------------------------------------------------------------
	// 파일 변경 감지 (존재 여부 확인)
	async checkForChanges (filePaths: string[]): Promise<string[]> {
		const changedFiles: string[] = [];

		for (const filePath of filePaths) {
			try {
				await vscode.workspace.fs.stat(vscode.Uri.file(filePath));
			}
			catch {
				changedFiles.push(filePath);
			}
		}

		return changedFiles;
	}

	// ---------------------------------------------------------------------------------------------
	// 북마크 폴더 경로 업데이트
	updateBookmarkPath (newPath: string): void {
		this.bookmarkPath = newPath;
	}
}
