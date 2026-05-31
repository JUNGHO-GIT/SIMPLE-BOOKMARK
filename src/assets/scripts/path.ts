// assets/scripts/path.ts

import { fs, os, path } from "@exportLibs";

// 1-1. 대상 파일명 보정
export const gtTgtFlNm = (_dir: string, fileName: string): string => fileName;

// 1-2. 워크스페이스 경로 정규화
const nrmlWsRt = (wsRt: string): string => path.resolve(wsRt);

// 1-3. 중앙 북마크 루트 경로 반환
export const gtBmRtPth = (): string => path.join(os.homedir(), ".bookmark");

// 1-4. 기존 워크스페이스 북마크 경로 반환
export const gtLgcyBmPth = (wsRt: string): string => path.join(nrmlWsRt(wsRt), ".bookmark");

// 1-5. 워크스페이스별 중앙 저장 상대 경로 계산
const gtWsStRlPt = (wsRt: string): string => {
  const normRt = nrmlWsRt(wsRt);

  if (process.platform === "win32") {
  	const parsedRoot = path.parse(normRt);
    const driveName = parsedRoot.root.replace(/[:\\/]+/g, "").toLowerCase() || "drive";
    const segments = normRt.slice(parsedRoot.root.length).split(path.sep).filter(Boolean);

    return path.join(driveName, ...segments);
  }
  const segments = normRt.split(path.sep).filter(Boolean);
  return segments.length > 0 ? path.join(...segments) : "_root";
};

// 1-6. 중앙 관리용 북마크 경로 반환
export const gtBmPth = (wsRt: string): string => path.join(gtBmRtPth(), gtWsStRlPt(wsRt));

// 1-7. 북마크 폴더 내부 경로 여부 판단
export const isWthnBm = (itemPath: string, bookmarkPath: string): boolean => itemPath.startsWith(bookmarkPath);

// 1-8. 파일명 검증
export const valFlNm = (fileName: string): string | null => {
  let valErr: string | null = null;
  const trmmFlNm = fileName.trim();
  const hsInvlSprt = fileName.includes("/") || fileName.includes("\\");

  if (!fileName || !trmmFlNm) {
  	valErr = "File name cannot be empty";
  }
  else if (hsInvlSprt) {
  	valErr = "Invalid characters in file name";
  }
  return valErr;
};

// 1-9. 경로 존재 여부 확인
export const exists = (filePath: string): boolean => fs.existsSync(filePath);
