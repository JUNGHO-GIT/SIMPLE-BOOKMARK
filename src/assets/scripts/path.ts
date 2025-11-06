// assets/scripts/path.ts

import { path, fs } from "@exportLibs";

// -----------------------------------------------------------------------------------------
// 대상 파일명의 유효성을 검토하고(필요 시) 보정
export const fnGetTargetFileName = (
	_dir: string,
	fileName: string
): string => {
	return fileName;
};

// -----------------------------------------------------------------------------------------
// 워크스페이스 루트 기준의 .bookmark 폴더 경로를 반환
export const fnGetBookmarkPath = (
	workspaceRoot: string
): string => {
	return path.join(workspaceRoot, ".bookmark");
};

// -----------------------------------------------------------------------------------------
// 주어진 경로가 북마크 폴더 내부인지 여부를 판단
export const fnIsWithinBookmark = (
	itemPath: string,
	bookmarkPath: string
): boolean => {
	return itemPath.startsWith(bookmarkPath);
};

// -----------------------------------------------------------------------------------------
// 파일/폴더 이름에 대한 기본 검증을 수행
export const fnValidateFileName = (
	fileName: string
): string | null => {
	return (!fileName || !fileName.trim()) ? "File name cannot be empty" :
	(fileName.includes("/") || fileName.includes("\\")) ? "Invalid characters in file name" :
	null;
};

// -----------------------------------------------------------------------------------------
// 파일/폴더의 동기 존재 여부를 확인
export const fnExists = (
	filePath: string
): boolean => {
	return fs.existsSync(filePath);
};