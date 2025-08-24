// services/BookmarkHistoryService.ts

import * as vscode from "vscode";
import * as path from "path";
import { BookmarkHistoryAction, BookmarkHistoryItem } from "../types/BookmarkTypes";

// -------------------------------------------------------------------------------------------------------------
export class BookmarkHistoryService {
    private historyStack: BookmarkHistoryAction[] = [];
    private redoStack: BookmarkHistoryAction[] = [];
    private readonly maxHistorySize = 50;

    // ---------------------------------------------------------------------------------------------
    // 작업을 히스토리에 추가
    // ---------------------------------------------------------------------------------------------
    addToHistory(action: BookmarkHistoryAction): void {
        this.historyStack.push(action);
        if (this.historyStack.length > this.maxHistorySize) {
            this.historyStack.shift();
        }
        this.redoStack = [];
    }

    // ---------------------------------------------------------------------------------------------
    // 항목의 전체 정보 캡처 (복원용)
    // - 파일인 경우: 내용까지 저장
    // - 폴더인 경우: 재귀적으로 하위 항목까지 기록
    // ---------------------------------------------------------------------------------------------
    async captureItem(itemPath: string): Promise<BookmarkHistoryItem | null> {
        try {
            const stat = await vscode.workspace.fs.stat(vscode.Uri.file(itemPath));
            const isFile = stat.type === vscode.FileType.File;

            const item: BookmarkHistoryItem = {
                path: itemPath,
                isFile: isFile
            };

            if (isFile) {
                item.content = await vscode.workspace.fs.readFile(vscode.Uri.file(itemPath));
            }
            else {
                const entries = await vscode.workspace.fs.readDirectory(vscode.Uri.file(itemPath));
                item.children = [];
                for (const [name] of entries) {
                    const childPath = path.join(itemPath, name);
                    const childItem = await this.captureItem(childPath);
                    if (childItem) {
                        item.children.push(childItem);
                    }
                }
            }

            return item;
        }
        catch {
            return null;
        }
    }

    // ---------------------------------------------------------------------------------------------
    // 항목 복원
    // - 파일: 저장된 content를 다시 씀
    // - 폴더: 생성 후 children 재귀 복원
    // ---------------------------------------------------------------------------------------------
    async restoreItem(item: BookmarkHistoryItem): Promise<void> {
        if (item.isFile && item.content) {
            await vscode.workspace.fs.writeFile(vscode.Uri.file(item.path), item.content);
        }
        else {
            await vscode.workspace.fs.createDirectory(vscode.Uri.file(item.path));
            if (item.children) {
                for (const child of item.children) {
                    await this.restoreItem(child);
                }
            }
        }
    }

    // ---------------------------------------------------------------------------------------------
    // Undo 실행
    // - create → 파일/폴더 삭제
    // - delete → 파일/폴더 복원
    // - copy   → 복사본 삭제
    // 실행 성공 시 redo 스택에 push
    // 실패 시 현재 작업 복원
    // ---------------------------------------------------------------------------------------------
    async undo(): Promise<boolean> {
        if (this.historyStack.length === 0) {
            return false;
        }

        const action = this.historyStack.pop()!;

        try {
            switch (action.type) {
                case 'create':
                    for (const item of action.items) {
                        await vscode.workspace.fs.delete(vscode.Uri.file(item.path), { recursive: true });
                    }
                    break;

                case 'delete':
                    for (const item of action.items) {
                        await this.restoreItem(item);
                    }
                    break;

                case 'copy':
                    for (const item of action.items) {
                        if (action.targetPath) {
                            const targetFile = path.join(action.targetPath, path.basename(item.path));
                            await vscode.workspace.fs.delete(vscode.Uri.file(targetFile), { recursive: true });
                        }
                    }
                    break;
            }

            this.redoStack.push(action);
            return true;
        }
        catch (error) {
            this.historyStack.push(action);
            throw error;
        }
    }

    // ---------------------------------------------------------------------------------------------
    // Redo 실행
    // - create → 파일/폴더 복원
    // - delete → 파일/폴더 삭제
    // - copy   → 파일/폴더 다시 복사
    // 실행 성공 시 history 스택에 push
    // 실패 시 redo 스택 복원
    // ---------------------------------------------------------------------------------------------
    async redo(): Promise<boolean> {
        if (this.redoStack.length === 0) {
            return false;
        }

        const action = this.redoStack.pop()!;

        try {
            switch (action.type) {
                case 'create':
                    for (const item of action.items) {
                        await this.restoreItem(item);
                    }
                    break;

                case 'delete':
                    for (const item of action.items) {
                        await vscode.workspace.fs.delete(vscode.Uri.file(item.path), { recursive: true });
                    }
                    break;

                case 'copy':
                    if (action.targetPath) {
                        for (const item of action.items) {
                            const source = item.path;
                            const target = path.join(action.targetPath, path.basename(item.path));
                            await this.copyFileOrFolder(source, target);
                        }
                    }
                    break;
            }

            this.historyStack.push(action);
            return true;
        }
        catch (error) {
            this.redoStack.push(action);
            throw error;
        }
    }

    // ---------------------------------------------------------------------------------------------
    // 히스토리 상태 확인
    // - canUndo(): undo 가능 여부
    // - canRedo(): redo 가능 여부
    // ---------------------------------------------------------------------------------------------
    canUndo(): boolean {
        return this.historyStack.length > 0;
    }

    canRedo(): boolean {
        return this.redoStack.length > 0;
    }

    // ---------------------------------------------------------------------------------------------
    // 히스토리 초기화
    // ---------------------------------------------------------------------------------------------
    clear(): void {
        this.historyStack = [];
        this.redoStack = [];
    }

    // ---------------------------------------------------------------------------------------------
    // 파일/폴더 복사 (재귀)
    // - 파일: 내용 그대로 쓰기
    // - 폴더: 디렉토리 생성 후 하위 항목 재귀 처리
    // ---------------------------------------------------------------------------------------------
    private async copyFileOrFolder(source: string, target: string): Promise<void> {
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
                // 이미 없는 경우는 무시
            }

            await vscode.workspace.fs.createDirectory(vscode.Uri.file(target));
            const entries = await vscode.workspace.fs.readDirectory(vscode.Uri.file(source));

            for (const [name] of entries) {
                const s = path.join(source, name);
                const t = path.join(target, name);
                await this.copyFileOrFolder(s, t);
            }
        }
    }
}
