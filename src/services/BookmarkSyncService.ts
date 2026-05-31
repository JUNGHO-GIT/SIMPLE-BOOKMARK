// services/BookmarkSyncService.ts

import { path, TextEncoder, vscode } from "@exportLibs";
import { logger, validateFileName as valFlNm } from "@exportScripts";
import type { BookmarkMetadata as BmMeta } from "@exportTypes";
import { BookmarkStatus as BmStat } from "@exportTypes";

export const BmSyncSvc = (bookmarkPath: string, onSyncUpdate?: (p: string, status: BmStat) => void, onRfrsNdd?: () => void) => {
  // 0. 변수 설정 ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――-
  const bmWtch = new Map<string, vscode.FileSystemWatcher>();
  const wtchPthRfs = new Map<string, Set<string>>();
  const bkmrFls = new Map<string, BmMeta>();
  const bmNms = new Set<string>();
  const METADATA_EXT = `.bookmark.json`;
  const disposables: vscode.Disposable[] = [];
  const textEncoder = new TextEncoder();
  const SYNC_DBNC_MS = 150;
  const syncTimers = new Map<string, NodeJS.Timeout>();

  // 파일/폴더 존재 여부를 확인 ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
  const fileExists = async (p: string): Promise<boolean> => {
    try {
      await vscode.workspace.fs.stat(vscode.Uri.file(p));
      return true;
    }
    catch {
      return false;
    }
  };

  // 동기화 요청을 파일별로 디바운싱 ――――――――――――――――――――――――――――――――――――――――――――――――
  const clrSyncTmrFr = (originalPath: string): void => {
    const exstTmr = syncTimers.get(originalPath);
    exstTmr && clearTimeout(exstTmr);
    syncTimers.delete(originalPath);
  };

  // 파일별 watcher 키 정규화 ――――――――――――――――――――――――――――――――――――――――――――――――――――――
  const nrmlWtchKy = (targetPath: string): string => process.platform === `win32` ? path.resolve(targetPath).toLowerCase() : path.resolve(targetPath);

  // 파일 변경 이벤트 적용 ――――――――――――――――――――――――――――――――――――――――――――――――――――――――
  const qSyncBm = (originalPath: string): void => {
    clrSyncTmrFr(originalPath);

    const timer = setTimeout(() => {
      syncTimers.delete(originalPath);
      syncBookmark(originalPath).catch((error) => {
        logger(`error`, `sync - ${error instanceof Error ? error.message : String(error)}`);
      });
    }, SYNC_DBNC_MS);

    syncTimers.set(originalPath, timer);
  };

  // 파일의 확장자를 보존하여 새 이름을 생성 ――――――――――――――――――――――――――――――――――――――――――――――――
  const preserveExt = (originalPath: string, newNameRaw: string, isFile: boolean): string => {
    const ext = path.extname(originalPath);
    return isFile && !newNameRaw.includes(".") && ext ? `${newNameRaw}${ext}` : newNameRaw;
  };

  // 고유 파일/폴더명을 생성 ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――--
  const gnrtUnqFsNm = async (dir: string, baseName: string): Promise<string> => {
    let name = baseName;
    let i = 1;
    while (await fileExists(path.join(dir, name))) {
      const ext = path.extname(baseName);
      const stem = path.basename(baseName, ext);
      name = `${stem}_${i}${ext}`;
      i++;
    }
    return name;
  };

  // 이벤트 기반 동기화 설정 ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――-
  // - 글로벌 워처 제거
  // - 북마크별 워처만 등록
  // - 문서 저장/변경/삭제 이벤트를 구독하여 북마크 상태를 갱신
  const stpEvtLstn = (): void => {
    const saveListener = vscode.workspace.onDidSaveTextDocument((document) => {
      const filePath = document.uri.fsPath;
      if (isBkmrFl(filePath)) {
        logger(`debug`, `save - ${filePath}`);
        qSyncBm(filePath);
      }
    });
    disposables.push(saveListener);
  };

  // 디렉터리별 워처 생성 ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――--
  // 같은 폴더의 북마크는 하나의 watcher를 공유하여 파일 이벤트 결과를 유지
  const crtWtchFr = (originalPath: string): void => {
    const watcherDir = path.dirname(originalPath);
    const watcherKey = nrmlWtchKy(watcherDir);
    const watchedPaths = wtchPthRfs.get(watcherKey) ?? new Set<string>();
    watchedPaths.add(originalPath);
    wtchPthRfs.set(watcherKey, watchedPaths);

    bmWtch.has(watcherKey) || (() => {
        const pattern = new vscode.RelativePattern(watcherDir, `*`);
        const watcher = vscode.workspace.createFileSystemWatcher(pattern, false, false, false);

        watcher.onDidChange((uri) => {
          const eventPath = uri.fsPath;
          if (isBkmrFl(eventPath)) {
            logger(`debug`, `save - ${eventPath}`);
            qSyncBm(eventPath);
          }
        });
        watcher.onDidCreate(async (uri) => {
          const eventPath = uri.fsPath;
          isBkmrFl(eventPath) && (await updtBmStat(eventPath, BmStat.SYNCED));
        });
        watcher.onDidDelete(async (uri) => {
          const eventPath = uri.fsPath;
          isBkmrFl(eventPath) && (await updtBmStat(eventPath, BmStat.MISSING));
        });

        bmWtch.set(watcherKey, watcher);
      })();
  };

  // 특정 원본 경로의 파일시스템 워처 참조를 해제 ――――――――――――――――――――――――――――――――――――――――――――--
  const dspsWtchFr = (originalPath: string): void => {
    clrSyncTmrFr(originalPath);
    const watcherKey = nrmlWtchKy(path.dirname(originalPath));
    const watchedPaths = wtchPthRfs.get(watcherKey);
    watchedPaths?.delete(originalPath);

    if (watchedPaths && watchedPaths.size === 0) {
      wtchPthRfs.delete(watcherKey);
      const watcher = bmWtch.get(watcherKey);
      watcher?.dispose();
      bmWtch.delete(watcherKey);
    }
  };

  // 병렬 처리 및 배치 상태 업데이트 ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――-
  const ldExstBms = async (): Promise<void> => {
    try {
      const entries = await vscode.workspace.fs.readDirectory(vscode.Uri.file(bookmarkPath));
      const metaPaths = entries.filter(([name]) => name.endsWith(METADATA_EXT)).map(([name]) => path.join(bookmarkPath, name));

      // 병렬로 메타데이터 로딩 - 최대 50개씩 배치 처리
      const BATCH_SIZE = 50;
      const lddMeta: BmMeta[] = [];

      for (let i = 0; i < metaPaths.length; i += BATCH_SIZE) {
        const batch = metaPaths.slice(i, i + BATCH_SIZE);
        const btchPrms = batch.map(async (metadataPath) => {
          try {
            const metadata = await loadMetadata(metadataPath);
            if (metadata) {
              bkmrFls.set(metadata.originalPath, metadata);
              bmNms.add(metadata.bookmarkName);
              crtWtchFr(metadata.originalPath);
            }
            return metadata;
          }
          catch (error) {
            logger(`error`, `activate - ${error instanceof Error ? error.message : String(error)}`);
            return null;
          }
        });
        const batchResults = await Promise.all(btchPrms);
        batchResults.forEach((meta) => {
          meta && lddMeta.push(meta);
        });
      }
      // 배치로 상태 확인 후 한 번에 갱신
      lddMeta.length > 0 && (await (async () => {
          for (let i = 0; i < lddMeta.length; i += BATCH_SIZE) {
            const batch = lddMeta.slice(i, i + BATCH_SIZE);
            const statPrms = batch.map(async (metadata) => {
              const status = await chckBmStat(metadata);
              onSyncUpdate?.(metadata.originalPath, status);
              return status;
            });
            await Promise.all(statPrms);
          }
          onRfrsNdd?.();
        })());
    }
    catch (error) {
      logger(`error`, `activate - ${error}`);
    }
  };

  // 북마크 추가 (메타데이터 생성 및 저장) ――――――――――――――――――――――――――――――――――――――――――――――――
  const addBookmark = async (originalPath: string, bookmarkName?: string): Promise<void> => {
    try {
      const stat = await vscode.workspace.fs.stat(vscode.Uri.file(originalPath));

      const baseName = path.basename(originalPath);
      const fnlBmNm = bookmarkName || baseName;
      const unqBmNm = gnrtUnqBmNm(fnlBmNm);
      const curTs = Date.now();

      const metadata: BmMeta = {
        originalPath: originalPath,
        bookmarkName: unqBmNm,
        isFile: stat.type === vscode.FileType.File,
        createdAt: curTs,
        lastSyncAt: curTs,
        originalExists: true,
      };

      const metadataPath = path.join(bookmarkPath, `${unqBmNm}${METADATA_EXT}`);
      await saveMetadata(metadataPath, metadata);

      bkmrFls.set(originalPath, metadata);
      bmNms.add(unqBmNm);
      crtWtchFr(originalPath);

      onSyncUpdate?.(originalPath, BmStat.SYNCED);
      onRfrsNdd?.();
      logger(`debug`, `add - ${unqBmNm}`);
    }
    catch (error) {
      logger(`error`, `add - ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  // 고유한 북마크 이름 생성 (중복 방지) ――――――――――――――――――――――――――――――――――――――――――――――――-
  const gnrtUnqBmNm = (bookmarkName: string): string => {
    let uniqueName = bookmarkName;
    let counter = 1;
    while (isBmNmExst(uniqueName)) {
      const ext = path.extname(bookmarkName);
      const baseName = path.basename(bookmarkName, ext);
      uniqueName = `${baseName}_${counter}${ext}`;
      counter++;
    }
    return uniqueName;
  };

  // 동일한 북마크 이름이 이미 존재하는지 확인 ――――――――――――――――――――――――――――――――――――――――――-
  const isBmNmExst = (name: string): boolean => bmNms.has(name);

  // 북마크 이름 변경 ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――--
  // 북마크 이름 및 원본 파일/폴더 이름을 변경하고 메타데이터를 갱신
  const rnmBm = async (originalPath: string, newNameRaw: string): Promise<void> => {
    const metadata = bkmrFls.get(originalPath);
    if (!metadata) {
      logger(`warn`, `rename - metadata missing: ${originalPath}`);
      return;
    }

    const nameError = valFlNm(newNameRaw);
    if (nameError) {
      logger(`warn`, `rename - invalid name: ${newNameRaw} / ${nameError}`);
      return;
    }

    // 메타데이터 이름 중복 처리
    const existsOther = Array.from(bkmrFls.values()).some((m) => m.originalPath !== originalPath && m.bookmarkName === newNameRaw);
    const fnlMtNm = existsOther ? gnrtUnqBmNm(newNameRaw) : newNameRaw;
    const prevBmNm = metadata.bookmarkName;

    // 실제 파일/폴더 rename 준비
    const dir = path.dirname(metadata.originalPath);
    const dsrdFsNm = preserveExt(metadata.originalPath, newNameRaw, metadata.isFile);
    const cnddFsPth = path.join(dir, dsrdFsNm);

    // 대상 경로가 현재 경로와 동일하면 실제 파일시스템 rename은 생략
    let nwOrigPth = metadata.originalPath;
    if (path.resolve(cnddFsPth) !== path.resolve(metadata.originalPath)) {
      const uniqueFsName = await gnrtUnqFsNm(dir, dsrdFsNm);
      nwOrigPth = path.join(dir, uniqueFsName);

      // 파일시스템 rename
      try {
        logger(`debug`, `rename - ${metadata.originalPath} -> ${nwOrigPth}`);
        await vscode.workspace.fs.rename(vscode.Uri.file(metadata.originalPath), vscode.Uri.file(nwOrigPth), { overwrite: false });
      }
      catch (error) {
        logger(`error`, `rename: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    else {
      logger(`debug`, `rename - ${metadata.originalPath}`);
    } // 메타데이터 파일 rename(이름 변경 반영)
    const oldMetaPath = path.join(bookmarkPath, `${metadata.bookmarkName}${METADATA_EXT}`);
    const newMetaPath = path.join(bookmarkPath, `${fnlMtNm}${METADATA_EXT}`);

    metadata.bookmarkName = fnlMtNm;
    metadata.originalPath = nwOrigPth;
    metadata.lastSyncAt = Date.now();

    // 메타데이터 파일명이 변경되지 않은 경우 기존 파일 삭제는 하지 않음
    await saveMetadata(newMetaPath, metadata);
    oldMetaPath !== newMetaPath && (await vscode.workspace.fs.delete(vscode.Uri.file(oldMetaPath)));
    if (prevBmNm !== fnlMtNm) {
      bmNms.delete(prevBmNm);
      bmNms.add(fnlMtNm);
    }

    // 내부 맵과 워처 재바인딩
    if (path.resolve(originalPath) !== path.resolve(nwOrigPth)) {
    	bkmrFls.delete(originalPath);
      dspsWtchFr(originalPath);
      bkmrFls.set(nwOrigPth, metadata);
      crtWtchFr(nwOrigPth);
    }
    // 경로가 동일하면 맵에 메타데이터만 갱신
    else {
    	bkmrFls.set(originalPath, metadata);
    }
    onSyncUpdate?.(nwOrigPth, BmStat.SYNCED);
    onRfrsNdd?.();
    logger(`debug`, `rename - ${fnlMtNm} / ${nwOrigPth}`);
  }; // 북마크 제거 ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
  // - 메타데이터 파일을 삭제하고 워처 및 내부 상태를 정리
  const rmvBm = async (originalPath: string): Promise<void> => {
    const metadata = bkmrFls.get(originalPath);

    metadata && (await (async () => {
        try {
          const metadataPath = path.join(bookmarkPath, `${metadata.bookmarkName}${METADATA_EXT}`);
          await vscode.workspace.fs.delete(vscode.Uri.file(metadataPath));
          bkmrFls.delete(originalPath);
          bmNms.delete(metadata.bookmarkName);
          dspsWtchFr(originalPath);
          onRfrsNdd?.();
          logger(`debug`, `remove: ${originalPath}`);
        }
        catch (error) {
          logger(`error`, `remove: ${error instanceof Error ? error.message : String(error)}`);
        }
      })());
  };

  // 특정 북마크 동기화 ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――-
  // 원본 파일 상태에 따라 메타데이터를 갱신하고 상태를 반영
  const syncBookmark = async (originalPath: string): Promise<void> => {
    const metadata = bkmrFls.get(originalPath);

    metadata && (await (async () => {
        try {
          await vscode.workspace.fs.stat(vscode.Uri.file(originalPath));
          metadata.lastSyncAt = Date.now();
          metadata.originalExists = true;
          const metadataPath = path.join(bookmarkPath, `${metadata.bookmarkName}${METADATA_EXT}`);
          await saveMetadata(metadataPath, metadata);
          onSyncUpdate?.(originalPath, BmStat.SYNCED);
          onRfrsNdd?.();
        }
        catch {
          metadata.originalExists = false;
          const metadataPath = path.join(bookmarkPath, `${metadata.bookmarkName}${METADATA_EXT}`);
          await saveMetadata(metadataPath, metadata);
          onSyncUpdate?.(originalPath, BmStat.MISSING);
        }
      })());
  };

  // 북마크 상태 갱신 ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
  // - 외부에서 전달된 상태를 즉시 반영하고 새로고침 요청
  const updtBmStat = async (originalPath: string, status: BmStat): Promise<void> => {
    onSyncUpdate?.(originalPath, status);
    onRfrsNdd?.();
  };

  // 북마크 상태 확인 ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――-
  // - 파일 존재 여부 검사
  const chckBmStat = async (metadata: BmMeta): Promise<BmStat> => {
    try {
      await vscode.workspace.fs.stat(vscode.Uri.file(metadata.originalPath));
      return BmStat.SYNCED;
    }
    catch {
      return BmStat.MISSING;
    }
  };

  // 북마크 여부 확인 ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――-
  const isBkmrFl = (filePath: string): boolean => bkmrFls.has(filePath);

  // 메타데이터 조회 ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――--
  const gtAllBms = (): BmMeta[] => Array.from(bkmrFls.values());

  // 특정 메타데이터 조회 ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――--
  const getBookmark = (originalPath: string): BmMeta | undefined => bkmrFls.get(originalPath);

  // 원본 경로 변경 시 메타데이터 갱신 ―――――――――――――――――――――――――――――――――――――――――――――--
  const updtOrigPth = async (oldPath: string, newPath: string): Promise<void> => {
    const metadata = bkmrFls.get(oldPath);

    metadata && (await (async () => {
        bkmrFls.delete(oldPath);
        dspsWtchFr(oldPath);

        metadata.originalPath = newPath;

        const metadataPath = path.join(bookmarkPath, `${metadata.bookmarkName}${METADATA_EXT}`);
        await saveMetadata(metadataPath, metadata);

        bkmrFls.set(newPath, metadata);
        crtWtchFr(newPath);

        onSyncUpdate?.(newPath, BmStat.SYNCED);
        onRfrsNdd?.();
      })());
  };

  // 메타데이터 저장 ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――--
  const saveMetadata = async (metadataPath: string, metadata: BmMeta): Promise<void> => {
    const content = JSON.stringify(metadata, null, 2);
    await vscode.workspace.fs.writeFile(vscode.Uri.file(metadataPath), textEncoder.encode(content));
  };

  // 메타데이터 로드 ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――--
  const loadMetadata = async (metadataPath: string): Promise<BmMeta | null> => {
    try {
      const content = await vscode.workspace.fs.readFile(vscode.Uri.file(metadataPath));
      return JSON.parse(content.toString()) as BmMeta;
    }
    catch {
      return null;
    }
  };

  // 리소스 정리 ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――-
  const dispose = (): void => {
    disposables.forEach((d) => {
      d.dispose();
    });
    syncTimers.forEach((timer) => {
      clearTimeout(timer);
    });
    syncTimers.clear();
    bmWtch.forEach((watcher) => {
      watcher.dispose();
    });
    bmWtch.clear();
    wtchPthRfs.clear();
    bkmrFls.clear();
    bmNms.clear();
  };

  // 초기화 ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――-
  stpEvtLstn();
  ldExstBms().catch ((err) => {
    logger(`error`, `activate - ${err instanceof Error ? err.message : String(err)}`);
  });

  // 99. return ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――--
  return {
    addBookmark,
    renameBookmark: rnmBm,
    removeBookmark: rmvBm,
    getAllBookmarks: gtAllBms,
    getBookmark,
    updateOriginalPath: updtOrigPth,
    dispose,
  };
};
