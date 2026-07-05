// assets/scripts/path.ts

import { os, path } from "@exportLibs";

// 1-1. 워크스페이스 경로 정규화
const nrmlWsRt = (wsRt: string): string => path.resolve(wsRt);

// 1-2. 중앙 북마크 루트 경로 반환
const gtBmRtPth = (): string => path.join(os.homedir(), ".bookmark");

// 1-3. 기존 워크스페이스 북마크 경로 반환
export const gtLgcyBmPth = (wsRt: string): string => path.join(nrmlWsRt(wsRt), ".bookmark");

// 1-4. 워크스페이스별 중앙 저장 상대 경로 계산
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

// 1-5. 중앙 관리용 북마크 경로 반환
export const gtBmPth = (wsRt: string): string => path.join(gtBmRtPth(), gtWsStRlPt(wsRt));

// 1-6. 파일명 검증 (경로 구분자·금지 문자·제어 문자·예약어·후행 공백/마침표 차단)
export const valFlNm = (fileName: string): string | null => {
  const trmmFlNm = fileName.trim();

  if (!trmmFlNm) {
    return "File name cannot be empty";
  }
  if (trmmFlNm === "." || trmmFlNm === "..") {
    return "Invalid file name";
  }
  const hsCtrlChr = Array.from(trmmFlNm).some((ch) => ch.charCodeAt(0) < 32);
  const hsInvlChr = /[\\/:*?"<>|]/.test(trmmFlNm);
  if (hsInvlChr || hsCtrlChr) {
    return "Invalid characters in file name";
  }
  // Windows 전용: 예약 장치명 및 후행 공백/마침표는 실제 생성 시 손상되므로 차단
  if (process.platform === "win32") {
    const winReserved = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i;
    const hasTrailBad = /[ .]$/.test(trmmFlNm);
    if (winReserved.test(trmmFlNm) || hasTrailBad) {
      return "Reserved or invalid file name on Windows";
    }
  }
  return null;
};
