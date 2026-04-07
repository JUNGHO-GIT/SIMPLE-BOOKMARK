// assets/scripts/path.ts

import { path, fs, os } from "@exportLibs";

// 1. 대상 파일명 보정 ----------------------------------------------------------------------------
export const getTargetFileName = (
	_dir: string,
	fileName: string
): string => {
	return fileName;
};

// 2. 워크스페이스 경로 정규화 ----------------------------------------------------------------------
const normalizeWorkspaceRoot = (
	workspaceRoot: string
): string => {
	return path.resolve(workspaceRoot);
};

// 3. 중앙 북마크 루트 경로 반환 --------------------------------------------------------------------
export const getBookmarkRootPath = (
): string => {
	return path.join(os.homedir(), ".bookmark");
};

// 4. 기존 워크스페이스 북마크 경로 반환 --------------------------------------------------------------
export const getLegacyBookmarkPath = (
	workspaceRoot: string
): string => {
	return path.join(normalizeWorkspaceRoot(workspaceRoot), ".bookmark");
};

// 5. 워크스페이스별 중앙 저장 상대 경로 계산 ---------------------------------------------------------
const getWorkspaceStorageRelativePath = (
	workspaceRoot: string
): string => {
	const normalizedRoot = normalizeWorkspaceRoot(workspaceRoot);

	if (process.platform === "win32") {
		const parsedRoot = path.parse(normalizedRoot);
		const driveName = parsedRoot.root.replace(/[:\\/]+/g, "").toLowerCase() || "drive";
		const segments = normalizedRoot
			.slice(parsedRoot.root.length)
			.split(path.sep)
			.filter(Boolean);

		return path.join(driveName, ...segments);
	}

	const segments = normalizedRoot.split(path.sep).filter(Boolean);
	return segments.length > 0 ? path.join(...segments) : "_root";
};

// 6. 중앙 관리용 .bookmark 폴더 경로 반환 -----------------------------------------------------------
export const getBookmarkPath = (
	workspaceRoot: string
): string => {
	return path.join(
		getBookmarkRootPath(),
		getWorkspaceStorageRelativePath(workspaceRoot)
	);
};

// 7. 북마크 폴더 내부 경로 여부 판단 ----------------------------------------------------------------
export const isWithinBookmark = (
	itemPath: string,
	bookmarkPath: string
): boolean => {
	return itemPath.startsWith(bookmarkPath);
};

// 8. 파일명 검증 -----------------------------------------------------------------------------------
export const validateFileName = (
	fileName: string
): string | null => {
	return (!fileName || !fileName.trim()) ? "File name cannot be empty" :
	(fileName.includes("/") || fileName.includes("\\")) ? "Invalid characters in file name" :
	null;
};

// 9. 경로 존재 여부 확인 ----------------------------------------------------------------------------
export const exists = (
	filePath: string
): boolean => {
	return fs.existsSync(filePath);
};
