// utils/BookmarkPathUtil.ts

import * as path from "path";
import * as fs from "fs";

// -------------------------------------------------------------------------------------------------------------
export class BookmarkPathUtil {

    // ---------------------------------------------------------------------------------------------
    // 파일명 그대로 반환 (덮어쓰기 허용)
    // ---------------------------------------------------------------------------------------------
    static getTargetFileName(dir: string, fileName: string): string {
        return fileName;
    }

    // ---------------------------------------------------------------------------------------------
    // 워크스페이스 내 .bookmark 폴더 경로 반환
    // ---------------------------------------------------------------------------------------------
    static getBookmarkPath(workspaceRoot: string): string {
        return path.join(workspaceRoot, '.bookmark');
    }

    // ---------------------------------------------------------------------------------------------
    // 주어진 경로가 .bookmark 폴더 내부에 포함되는지 확인
    // ---------------------------------------------------------------------------------------------
    static isWithinBookmark(itemPath: string, bookmarkPath: string): boolean {
        return itemPath.startsWith(bookmarkPath);
    }

    // ---------------------------------------------------------------------------------------------
    // 파일명 유효성 검사
    // - 빈 문자열인지 확인
    // - 슬래시(/, \) 포함 여부 확인
    // ---------------------------------------------------------------------------------------------
    static validateFileName(fileName: string): string | null {
        if (!fileName || !fileName.trim()) {
            return 'File name cannot be empty';
        }
        if (fileName.includes('/') || fileName.includes('\\')) {
            return 'Invalid characters in file name';
        }
        return null;
    }

    // ---------------------------------------------------------------------------------------------
    // 지정한 파일/폴더 경로가 실제로 존재하는지 확인
    // ---------------------------------------------------------------------------------------------
    static exists(filePath: string): boolean {
        return fs.existsSync(filePath);
    }
}
