// assets/scripts/path.ts

import { fs, os, path } from "@exportLibs";

// 1-1. 대상 파일명 보정
export const getTargetFileName = (_dir: string, fileName: string): string => fileName;

// 1-2. 워크스페이스 경로 정규화
const normalizeWorkspaceRoot = (workspaceRoot: string): string => path.resolve(workspaceRoot);

// 1-3. 중앙 북마크 루트 경로 반환
export const getBookmarkRootPath = (): string => path.join(os.homedir(), ".bookmark");

// 1-4. 기존 워크스페이스 북마크 경로 반환
export const getLegacyBookmarkPath = (workspaceRoot: string): string => path.join(normalizeWorkspaceRoot(workspaceRoot), ".bookmark");

// 1-5. 워크스페이스별 중앙 저장 상대 경로 계산
const getWorkspaceStorageRelativePath = (workspaceRoot: string): string => {
  const normalizedRoot = normalizeWorkspaceRoot(workspaceRoot);

  if (process.platform === "win32") {
  	const parsedRoot = path.parse(normalizedRoot);
    const driveName = parsedRoot.root.replace(/[:\\/]+/g, "").toLowerCase() || "drive";
    const segments = normalizedRoot.slice(parsedRoot.root.length).split(path.sep).filter(Boolean);

    return path.join(driveName, ...segments);
  }
  const segments = normalizedRoot.split(path.sep).filter(Boolean);
  return segments.length > 0 ? path.join(...segments) : "_root";
};

// 1-6. 중앙 관리용 북마크 경로 반환
export const getBookmarkPath = (workspaceRoot: string): string => path.join(getBookmarkRootPath(), getWorkspaceStorageRelativePath(workspaceRoot));

// 1-7. 북마크 폴더 내부 경로 여부 판단
export const isWithinBookmark = (itemPath: string, bookmarkPath: string): boolean => itemPath.startsWith(bookmarkPath);

// 1-8. 파일명 검증
export const validateFileName = (fileName: string): string | null => {
  let validationError: string | null = null;
  const trimmedFileName = fileName.trim();
  const hasInvalidSeparator = fileName.includes("/") || fileName.includes("\\");

  if (!fileName || !trimmedFileName) {
  	validationError = "File name cannot be empty";
  }
  else if (hasInvalidSeparator) {
  	validationError = "Invalid characters in file name";
  }
  return validationError;
};

// 1-9. 경로 존재 여부 확인
export const exists = (filePath: string): boolean => fs.existsSync(filePath);
