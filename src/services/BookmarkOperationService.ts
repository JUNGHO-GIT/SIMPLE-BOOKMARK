// services/BookmarkOperationService.ts

import * as vscode from "vscode";
import * as path from "path";
import { BookmarkHistoryService } from "./BookmarkHistoryService";
import { BookmarkSyncService } from "./BookmarkSyncService";
import { BookmarkPathUtil } from "../utils/BookmarkPathUtil";

// -------------------------------------------------------------------------------------------------------------
export class BookmarkOperationService {
    constructor(
        private bookmarkPath: string,
        private historyService: BookmarkHistoryService,
        private syncService?: BookmarkSyncService
    ) {}

    // ---------------------------------------------------------------------------------------------
    // 파일/폴더 재귀적 복사
    // - 파일: 그대로 복사
    // - 폴더: 기존 대상이 있으면 삭제 후 전체 복사
    // ---------------------------------------------------------------------------------------------
    async copyFileOrFolder(source: string, target: string): Promise<void> {
        const stat = await vscode.workspace.fs.stat(vscode.Uri.file(source));

        if (stat.type === vscode.FileType.File) {
            const content = await vscode.workspace.fs.readFile(vscode.Uri.file(source));
            await vscode.workspace.fs.writeFile(vscode.Uri.file(target), content);
        }
        else {
            try {
                await vscode.workspace.fs.stat(vscode.Uri.file(target));
                await vscode.workspace.fs.delete(vscode.Uri.file(target), { recursive: true });
            }
            catch {
                // 대상 폴더가 없으면 무시
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
    // 파일/폴더 붙여넣기 (강제 덮어쓰기)
    // - 복사 완료 후 히스토리에 기록
    // ---------------------------------------------------------------------------------------------
    async pasteItems(copiedItems: vscode.Uri[], targetPath: string): Promise<void> {
        if (copiedItems.length === 0) {
            vscode.window.showErrorMessage("No items to paste.");
            return;
        }

        let pasteCount = 0;
        const copiedForHistory: any[] = [];

        for (const item of copiedItems) {
            const fileName = path.basename(item.fsPath);
            const targetFile = path.join(targetPath, fileName);

            await this.copyFileOrFolder(item.fsPath, targetFile);
            copiedForHistory.push({
                path: item.fsPath,
                isFile: (await vscode.workspace.fs.stat(item)).type === vscode.FileType.File
            });
            pasteCount++;
        }

        this.historyService.addToHistory({
            type: 'copy',
            items: copiedForHistory,
            targetPath: targetPath,
            timestamp: Date.now()
        });

        const message = pasteCount === 1
            ? "Item pasted successfully to target folder (overwritten)"
            : `${pasteCount} items pasted successfully to target folder (overwritten)`;
        vscode.window.showInformationMessage(message);
    }

    // ---------------------------------------------------------------------------------------------
    // 실제 원본 파일/폴더 삭제
    // - 삭제 전 전체 상태 캡처 (히스토리에 저장)
    // ---------------------------------------------------------------------------------------------
    async deleteOriginalFiles(items: vscode.Uri[]): Promise<void> {
        let deleteCount = 0;
        const deletedItems: any[] = [];

        for (const item of items) {
            const historyItem = await this.historyService.captureItem(item.fsPath);
            if (historyItem) {
                deletedItems.push(historyItem);
            }
        }

        for (const item of items) {
            try {
                await vscode.workspace.fs.delete(item, { recursive: true });
                deleteCount++;
                console.debug(`Original file deleted: ${item.fsPath}`);
            }
            catch (error) {
                console.error(`Failed to delete original file: ${item.fsPath}`, error);
            }
        }

        if (deletedItems.length > 0) {
            this.historyService.addToHistory({
                type: 'delete',
                items: deletedItems,
                timestamp: Date.now()
            });
        }

        const successMessage = deleteCount === 1
            ? "Original file deleted"
            : `${deleteCount} original files deleted`;
        vscode.window.showInformationMessage(successMessage);
    }

    // ---------------------------------------------------------------------------------------------
    // 실제 위치에 새 폴더 생성
    // - 같은 이름이 있으면 기존 폴더 삭제 후 새로 생성
    // ---------------------------------------------------------------------------------------------
    async createFolder(parentPath: string, folderName: string): Promise<void> {
        const error = BookmarkPathUtil.validateFileName(folderName);
        if (error) {
            vscode.window.showErrorMessage(error);
            return;
        }

        const folderPath = path.join(parentPath, folderName);

        try {
            await vscode.workspace.fs.stat(vscode.Uri.file(folderPath));
            await vscode.workspace.fs.delete(vscode.Uri.file(folderPath), { recursive: true });
        }
        catch {
            // 기존 폴더가 없으면 무시
        }

        await vscode.workspace.fs.createDirectory(vscode.Uri.file(folderPath));

        this.historyService.addToHistory({
            type: 'create',
            items: [{ path: folderPath, isFile: false }],
            timestamp: Date.now()
        });

        vscode.window.showInformationMessage(`Folder created in original location: ${folderName}`);
        console.debug(`Folder created: ${folderPath}`);
    }

    // ---------------------------------------------------------------------------------------------
    // 실제 위치에 새 파일 생성
    // - 빈 파일로 생성 후 히스토리에 기록
    // - 생성된 파일을 에디터로 열기 시도
    // ---------------------------------------------------------------------------------------------
    async createFile(parentPath: string, fileName: string): Promise<void> {
        const error = BookmarkPathUtil.validateFileName(fileName);
        if (error) {
            vscode.window.showErrorMessage(error);
            return;
        }

        const filePath = path.join(parentPath, fileName);

        await vscode.workspace.fs.writeFile(vscode.Uri.file(filePath), new Uint8Array(0));

        this.historyService.addToHistory({
            type: 'create',
            items: [{ path: filePath, isFile: true }],
            timestamp: Date.now()
        });

        vscode.window.showInformationMessage(`File created in original location: ${fileName}`);
        console.debug(`File created: ${filePath}`);

        try {
            const document = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
            await vscode.window.showTextDocument(document);
        }
        catch (error) {
            console.error(`Failed to open created file: ${error}`);
        }
    }

    // ---------------------------------------------------------------------------------------------
    // 원본 파일 이름 변경
    // - 복사 후 원본 삭제
    // - 북마크 동기화 서비스에 경로 업데이트 요청
    // ---------------------------------------------------------------------------------------------
    async renameOriginalFile(oldPath: string, newName: string): Promise<void> {
        const error = BookmarkPathUtil.validateFileName(newName);
        if (error) {
            vscode.window.showErrorMessage(error);
            return;
        }

        const parentDir = path.dirname(oldPath);
        const newPath = path.join(parentDir, newName);

        try {
            await this.copyFileOrFolder(oldPath, newPath);
            await vscode.workspace.fs.delete(vscode.Uri.file(oldPath), { recursive: true });

            await this.syncService?.updateOriginalPath(oldPath, newPath);

            vscode.window.showInformationMessage(`File renamed: ${newName}`);
            console.debug(`File renamed: ${oldPath} -> ${newPath}`);
        }
        catch (error) {
            vscode.window.showErrorMessage(`Failed to rename file: ${error}`);
        }
    }

    // ---------------------------------------------------------------------------------------------
    // 파일 변경 감지 (존재 여부 확인)
    // - 존재하지 않는 경우 변경된 파일로 간주
    // ---------------------------------------------------------------------------------------------
    async checkForChanges(filePaths: string[]): Promise<string[]> {
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
    // ---------------------------------------------------------------------------------------------
    updateBookmarkPath(newPath: string): void {
        this.bookmarkPath = newPath;
    }
}
