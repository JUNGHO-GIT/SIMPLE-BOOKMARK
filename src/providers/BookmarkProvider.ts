// providers/BookmarkProvider.ts

import { path, vscode } from "@exportLibs";
import { BookmarkModel as BmMdl } from "@exportModels";
import { getBookmarkPath as gtBmPth, getLegacyBookmarkPath as gtLgcyBmPth, logger, notify } from "@exportScripts";
import { BookmarkOperationService as BmOpSvc, BookmarkSyncService as BmSyncSvc } from "@exportServices";
import type { BookmarkMetadata as BmMeta, BookmarkModelType as BmMdlTyp, BookmarkOperationServiceType as BmOpSvcTyp, BookmarkSyncServiceType as BmSyncSvcTyp } from "@exportTypes";
import { BookmarkStatus as BmStat } from "@exportTypes";

export const BmProv = (wsRt: string | undefined) => {
  // 0. 변수 설정 ----------------------------------------------------------------------------
  const _onDdChgTrDt = new vscode.EventEmitter<BmMdlTyp | undefined | null | void>();
  const onDdChgTrDt = _onDdChgTrDt.event;
  let bookmarkPath: string | undefined;
  let cpdBms: vscode.Uri[] = [];
  let flOpSvc: BmOpSvcTyp | undefined;
  let syncService: BmSyncSvcTyp | undefined;
  const bmStatMp: Map<string, BmStat> = new Map();
  const expnDrPths: Set<string> = new Set();
  let refreshTimer: NodeJS.Timeout | null = null;
  let intlRfrsPndn = true;
  setTimeout(() => {
    intlBmFldr().catch ((err: unknown) => logger(`error`, `activate - ${err instanceof Error ? err.message : String(err)}`));
  }, 0);

  // 북마크 경로 존재 여부 확인 -------------------------------------------------------------------
  const pathExists = async (targetPath: string): Promise<boolean> => {
    try {
      await vscode.workspace.fs.stat(vscode.Uri.file(targetPath));
      return true;
    }
    catch {
      return false;
    }
  };

  // 북마크 저장소 폴더 준비 ---------------------------------------------------------------------
  const ensrBmFldr = async (targetPath: string): Promise<boolean> => {
    if (await pathExists(targetPath)) {
    	return true;
    }
    try {
      await vscode.workspace.fs.createDirectory(vscode.Uri.file(targetPath));
      notify(`info`, `create: ${targetPath}`);
      return true;
    }
    catch (error) {
      notify(`error`, `create: ${error}`);
      return false;
    }
  };

  // 기존 워크스페이스 북마크 메타데이터 마이그레이션 ----------------------------------------------
  const mgrLgBmFl = async (legacyPath: string, targetPath: string): Promise<void> => {
    const samePath = nrmlPth(legacyPath) === nrmlPth(targetPath);
    if (samePath || !(await pathExists(legacyPath))) {
    	return;
    }
    try {
      const entries = await vscode.workspace.fs.readDirectory(vscode.Uri.file(legacyPath));
      const metaEntr = entries.filter(([name, type]) => type === vscode.FileType.File && name.endsWith(`.bookmark.json`));

      if (metaEntr.length === 0) {
      	return;
      }
      let mgrtCnt = 0;
      for (const [name] of metaEntr) {
        const lgcyFlPth = path.join(legacyPath, name);
        const tgtFlPth = path.join(targetPath, name);

        if (await pathExists(tgtFlPth)) {
          logger(`debug`, `migrate - skip existing ${tgtFlPth}`);
          continue;
        }
        await vscode.workspace.fs.rename(vscode.Uri.file(lgcyFlPth), vscode.Uri.file(tgtFlPth), { overwrite: false });
        mgrtCnt++;
      }
      const rmnnEntr = await vscode.workspace.fs.readDirectory(vscode.Uri.file(legacyPath));
      rmnnEntr.length === 0 && (await vscode.workspace.fs.delete(vscode.Uri.file(legacyPath), {
          recursive: false,
          useTrash: false,
        }));

      if (mgrtCnt > 0) {
        notify(`info`, `migrate - ${mgrtCnt} bookmark metadata moved to ${targetPath}`);
        logger(`info`, `migrate - ${legacyPath} -> ${targetPath} (${mgrtCnt})`);
      }
    }
    catch (error) {
      logger(`error`, `migrate - ${legacyPath} ${String(error)}`);
    }
  };

  // bookmark 폴더를 준비하고 서비스 초기화 -------------------------------------------------
  const intlBmFldr = async (): Promise<void> => {
    const hasRoot = !!wsRt;

    return !hasRoot ? void 0 : (
        await (async () => {
          bookmarkPath = gtBmPth(wsRt as string);
          const lgcyBmPth = gtLgcyBmPth(wsRt as string);

          if (!(await ensrBmFldr(bookmarkPath))) {
          	return;
          }
          await mgrLgBmFl(lgcyBmPth, bookmarkPath);

          if (bookmarkPath) {
            syncService = BmSyncSvc(
              bookmarkPath,
              (p: string, status: BmStat) => {
                bmStatMp.set(p, status);
              },
              () => {
                if (intlRfrsPndn) {
                  refreshNow();
                  intlRfrsPndn = false;
                }
                else {
                  refresh();
                }
              },
            );
            flOpSvc = BmOpSvc(bookmarkPath, syncService);
          }
        })()
      );
  };

  // 트리 갱신 이벤트 즉시 반영 -----------------------------------------------------------
  const refreshNow = (): void => {
    refreshTimer && clearTimeout(refreshTimer);
    refreshTimer = null;
    _onDdChgTrDt.fire();
  };

  // 트리 갱신 이벤트를 디바운싱하여 갱신 ---------------------------------------------------
  const refresh = (): void => {
    refreshTimer && clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => _onDdChgTrDt.fire(), 50);
  };

  // TreeItem을 그대로 반환 ----------------------------------------------------------------
  const getTreeItem = (element: BmMdlTyp): vscode.TreeItem => element;

  // 자식 항목 가져오기 --------------------------------------------------------------
  // - 최상위: 실제 루트 북마크 목록만 반환(가짜 아이템 없음)
  // - 폴더 내부 탐색 시 순환(심볼릭 링크 등)으로 동일 경로가 반복적으로 나타나는 문제 방지
  // - 트리에서 루트 또는 자식 북마크 항목을 비동기로 생성하여 반환
  const getChildren = async (element?: BmMdlTyp): Promise<BmMdlTyp[]> => {
    const ready = !!bookmarkPath && !!syncService;

    return (
      !ready ? [] : !element ? await gtRtBms() : await (async () => {
          const ancestor = element._ancestorPaths;
          const isCycle = !!ancestor && ancestor.has(nrmlPth(element.originalPath));

          return (
            isCycle ? [] : !element.bookmarkMetadata.isFile ? await gtFldrCntn(element.originalPath, ancestor) : []
          );
        })()
    );
  };

  // 경로 비교를 위해 플랫폼별 정규화 ----------------------------------------------------------
  const nrmlPth = (p: string): string => {
    const resolvedPath = path.resolve(p);
    return process.platform === "win32" ? resolvedPath.toLowerCase() : resolvedPath;
  };

  // 디렉토리 우선, 이름 오름차순으로 정렬 ----------------------------------------------------
  const sortItems = (a: BmMdlTyp, b: BmMdlTyp): number => {
    const aIsDir = !a.bookmarkMetadata.isFile;
    const bIsDir = !b.bookmarkMetadata.isFile;
    return (
      aIsDir === bIsDir ? a.bookmarkMetadata.bookmarkName.localeCompare(b.bookmarkMetadata.bookmarkName) : aIsDir ? -1 : 1
    );
  };

  // 저장된 모든 루트 북마크를 불러와 TreeItem으로 변환 ---------------------------------------
  const gtRtBms = async (): Promise<BmMdlTyp[]> => {
    if (!syncService) {
	  return [];
    }

    const bookmarks = syncService.getAllBookmarks();
    const items: BmMdlTyp[] = [];

    for (const metadata of bookmarks) {
      const status = bmStatMp.get(metadata.originalPath) ?? BmStat.SYNCED;
      const item = BmMdl(metadata, status);

      !metadata.isFile && (() => {
          const key = nrmlPth(metadata.originalPath);
          item.collapsibleState = expnDrPths.has(key) ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed;
        })();

      items.push(item);
    }
    return items.sort(sortItems);
  };

  // 실제 폴더의 하위 항목 가져오기 ---------------------------------------------------
  const sortEntries = (a: [string, vscode.FileType], b: [string, vscode.FileType]): number => {
    const aIsDir = a[1] === vscode.FileType.Directory;
    const bIsDir = b[1] === vscode.FileType.Directory;
    return (
      aIsDir === bIsDir ? a[0].localeCompare(b[0]) : aIsDir ? -1 : 1
    );
  };

  // 폴더의 하위 항목 가져오기 --------------------------------------------------------
  const gtFldrCntn = async (folderPath: string, ancestor?: Set<string>): Promise<BmMdlTyp[]> => {
    try {
      const entries = await vscode.workspace.fs.readDirectory(vscode.Uri.file(folderPath));
      const items: BmMdlTyp[] = [];
      const srtdEntr = entries.sort(sortEntries);
      const now = Date.now();

      for (const [name, type] of srtdEntr) {
        const itemPath = path.join(folderPath, name);
        const normItmPth = nrmlPth(itemPath);

        if (ancestor?.has(normItmPth)) {
        	continue;
        }
        const isFile = type === vscode.FileType.File;
        const vrtlMeta = {
          originalPath: itemPath,
          bookmarkName: name,
          isFile,
          createdAt: now,
          lastSyncAt: now,
          originalExists: true,
        };

        const sysItem = BmMdl(vrtlMeta, BmStat.SYNCED);
        // 동일한 실제 경로가 트리의 여러 위치(루트 북마크/다른 폴더 하위)에서 동시에 노출될 수 있으므로
        // TreeItem.id 를 부모 경로를 포함한 고유 값으로 재정의하여 "요소가 이미 등록" 오류를 방지
        sysItem.id = `child:${folderPath}|${itemPath}`;

        !isFile && (() => {
            const key = normItmPth;
            sysItem.collapsibleState = expnDrPths.has(key) ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed;

            const chain = new Set<string>(ancestor ?? []);
            chain.add(nrmlPth(folderPath));
            sysItem._ancestorPaths = chain;
          })();

        items.push(sysItem);
      }
      return items;
    }
    catch (error) {
      logger(`error`, `select - ${folderPath} ${String(error)}`);
      return [];
    }
  };

  // 경로가 루트 북마크 또는 그 하위에 속하는지 확인 ------------------------------------------------
  const rslvRtBmPth = (targetPath: string): string | undefined => {
    if (!syncService) {
    	return ;
    }
    const direct = syncService.getBookmark(targetPath);
    if (direct) {
    	return direct.originalPath;
    }
    const normTgt = path.resolve(targetPath);
    const fldrBms = syncService
      .getAllBookmarks()
      .filter((bookmark) => !bookmark.isFile)
      .sort((a, b) => b.originalPath.length - a.originalPath.length);

    for (const bookmark of fldrBms) {
      const relative = path.relative(bookmark.originalPath, normTgt);
      const wthnBm = relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));

      if (wthnBm) {
      	return bookmark.originalPath;
      }
    }
    return ;
  };

  // 북마크 추가 --------------------------------------------------------------------
  const addBookmark = async (sourcePath: string, bookmarkName?: string): Promise<void> => {
    if (!syncService) {
	  notify(`error`, `activate - Bookmark service is not initialized.`);
	  return;
    }

    return await (async () => {
          try {
            const fnlBmNm = bookmarkName || path.basename(sourcePath);

            // 기존 동명 북마크 제거 후 생성
            const existing = syncService.getAllBookmarks().filter((b: BmMeta) => b.bookmarkName === fnlBmNm);
            for (const meta of existing) {
              await syncService.removeBookmark(meta.originalPath);
            }
            await syncService.addBookmark(sourcePath, fnlBmNm);
            notify(`info`, `overwrite - ${fnlBmNm}`);
            logger(`debug`, `add - ${sourcePath} -> ${fnlBmNm}`);
          }
          catch (error) {
            notify(`error`, `add - ${error}`);
          }
        })();
  };

  // 북마크 제거 (원본 파일/폴더 삭제 여부 선택 가능) ------------------------------------------
  const rmvBm = async (originalPath: string, dltOrig: boolean=false): Promise<void> => {
    const ready = !!syncService;

    return !ready ? notify(`error`, `activate: Bookmark service is not initialized.`) : await (async () => {
          try {
            await syncService?.removeBookmark(originalPath);

            dltOrig && (await (async () => {
                try {
                  await vscode.workspace.fs.delete(vscode.Uri.file(originalPath), { recursive: true });
                  logger(`debug`, `remove - ${originalPath}`);
                }
                catch {
                  // 원본이 이미 없는 경우는 조용히 무시
                  logger(`debug`, `remove - ${originalPath}`);
                }
              })());
            logger(`debug`, `remove - ${originalPath} ${dltOrig ? "with original" : "bookmark only"}`);
          }
          catch (error) {
            notify(`error`, `remove - ${error}`);
          }
        })();
  };

  // 북마크 이름 변경 ----------------------------------------------------------------
  // - 루트 북마크: syncService 통해 메타데이터+원본 rename
  // - 비루트(가상 항목): 파일시스템 직접 rename
  const rnmBm = async (originalPath: string, newName: string): Promise<void> => {
    const ready = !!syncService;

    return !ready ? notify(`error`, `activate: Bookmark service is not initialized.`) : await (async () => {
          const meta = syncService?.getBookmark(originalPath);

          return meta ? await (async () => {
                await syncService?.renameBookmark(originalPath, newName);
                logger(`debug`, `rename - ${originalPath} -> ${newName}`);
              })() : await (async () => {
                try {
                  const uri = vscode.Uri.file(originalPath);
                  const stat = await vscode.workspace.fs.stat(uri);
                  const dir = path.dirname(originalPath);

                  // 확장자 보존
                  const hasDot = newName.includes(".");
                  const ext = stat.type === vscode.FileType.File ? path.extname(originalPath) : "";
                  const bsCndd = stat.type === vscode.FileType.File && !hasDot ? `${newName}${ext}` : newName;

                  // 충돌 회피용 유니크 이름 생성
                  const mkUnique = async (candidate: string): Promise<string> => {
                    let name = candidate;
                    let i = 1;
                    // 동일한 원본 경로는 충돌로 간주하지 않음 (Windows 대소문자 처리 고려)
                    while (true) {
                      const cnddPth = path.join(dir, name);
                      const rslvCndd = path.resolve(cnddPth);
                      const rslvOrig = path.resolve(originalPath);
                      if (rslvCndd === rslvOrig || (process.platform === "win32" && rslvCndd.toLowerCase() === rslvOrig.toLowerCase())) {
                      	return name;
                      }
                      try {
                        await vscode.workspace.fs.stat(vscode.Uri.file(cnddPth));
                        const e = path.extname(candidate);
                        const stem = path.basename(candidate, e);
                        name = `${stem}_${i}${e}`;
                        i++;
                      }
                      catch {
                        return name;
                      }
                    }
                  };

                  const finalName = await mkUnique(bsCndd);
                  const newPath = path.join(dir, finalName);

                  await vscode.workspace.fs.rename(uri, vscode.Uri.file(newPath), { overwrite: false });
                  logger(`debug`, `rename - ${originalPath} -> ${newPath}`);
                }
                catch (error) {
                  notify(`error`, `rename - ${error}`);
                }
              })();
        })();
  };

  // 복사 -----------------------------------------------------------------------------------
  // - 스냅샷 + 중복 제거
  const cpyBms = (items: BmMdlTyp[]): void => {
    const dedup = new Map<string, vscode.Uri>();
    for (const it of items) {
      !dedup.has(it.originalPath) && dedup.set(it.originalPath, vscode.Uri.file(it.originalPath));
    }
    cpdBms = Array.from(dedup.values());
    if (cpdBms.length === 1) {
      const copiedName = path.basename(cpdBms[0].fsPath);
      notify(`info`, `copy - ${copiedName}`);
      logger(`debug`, `copy - ${copiedName}`);
    }
    else {
      notify(`info`, `copy - ${cpdBms.length}`);
      logger(`debug`, `copy - ${cpdBms.length}`);
    }
  };

  // 붙여넣기 (대상 폴더에 덮어쓰기) ------------------------------------------------------
  const pasteItems = async (targetPath: string): Promise<void> => {
    const ready = !!flOpSvc;

    return !ready ? notify(`error`, `activate - File operation service is not initialized.`) : await flOpSvc?.pasteItems(cpdBms, targetPath);
  };

  // 폴더 내 모든 파일 경로를 재귀적으로 수집 --------------------------------------------
  const cllFlFrFl = async (folderPath: string, visited: Set<string> = new Set()): Promise<string[]> => {
    const files: string[] = [];
    const normPth = nrmlPth(folderPath);

    // 순환 참조 방지 (심볼릭 링크 등)
    if (!visited.has(normPth)) {
      try {
        visited.add(normPth);
        const entries = await vscode.workspace.fs.readDirectory(vscode.Uri.file(folderPath));
        for (const [name, type] of entries) {
          const itemPath = path.join(folderPath, name);
          if (type === vscode.FileType.File) {
            files.push(itemPath);
          }
          else if (type === vscode.FileType.Directory) {
            const subFiles = await cllFlFrFl(itemPath, visited);
            files.push(...subFiles);
          }
        }
      }
      catch (error) {
        logger(`debug`, `paste: failed to collect files from ${folderPath} ${error}`);
      }
    }
    return files;
  };

  // 루트 붙여넣기: 파일명 매칭 → 각 북마크의 실제 경로에 덮어쓰기 -------------------------
  const pstItmsTRt = async (): Promise<void> => {
    const actvFlOpSvc = flOpSvc;
    const actvSyncSvc = syncService;

    if (!actvFlOpSvc || !actvSyncSvc) {
      notify(`error`, `activate - File operation service is not initialized.`);
      return;
    }

    const all = actvSyncSvc.getAllBookmarks();

    // 모든 북마크(파일 및 폴더 내 파일)를 파일명으로 매핑
    // 참고: 동일 파일명이 여러 곳에 있을 경우 마지막 것이 사용됨
    const nmTOrigPth = new Map<string, string>();
    const srcTOrigPth = new Map<string, string>();
    for (const m of all) {
      if (m.isFile) {
        nmTOrigPth.set(m.bookmarkName, m.originalPath);
      }
      else {
        const folderFiles = await cllFlFrFl(m.originalPath);
        const isBsBm = m.bookmarkName === `.base` || path.basename(m.originalPath) === `.base`;

        for (const filePath of folderFiles) {
          const fileName = path.basename(filePath);
          nmTOrigPth.set(fileName, filePath);

          if (isBsBm && wsRt) {
            const relativePath = path.relative(m.originalPath, filePath);
            const isRltvPth = relativePath !== "" && !relativePath.startsWith("..") && !path.isAbsolute(relativePath);

            isRltvPth && srcTOrigPth.set(filePath, path.join(wsRt, relativePath));
          }
        }
      }
    }

    nmTOrigPth.size === 0 ? void vscode.window.showWarningMessage("[Simple-Bookmark] No root file bookmarks to overwrite.") : await actvFlOpSvc.pasteItemsToRoot(cpdBms, nmTOrigPth, srcTOrigPth);
  };

  // 폴더 생성 ---------------------------------------------------------------------------------
  const createFolder = async (parentPath: string, folderName: string): Promise<void> => {
    const ready = !!flOpSvc;

    return !ready ? notify(`error`, `activate - File operation service is not initialized.`) : await flOpSvc?.createFolder(parentPath, folderName);
  };

  // 파일 생성 ---------------------------------------------------------------------------------
  const createFile = async (parentPath: string, fileName: string): Promise<void> => {
    const ready = !!flOpSvc;

    return !ready ? notify(`error`, `activate - File operation service is not initialized.`) : await flOpSvc?.createFile(parentPath, fileName);
  };

  // 원본 파일/폴더 직접 삭제 ---------------------------------------------------------------------
  const dltOrigItms = async (origPths: string[]): Promise<void> => {
    const ready = !!flOpSvc;

    return !ready ? notify(`error`, `activate - File operation service is not initialized.`) : await flOpSvc?.deleteOriginalFiles(origPths.map((originalPath) => vscode.Uri.file(originalPath)));
  };

  // Getter 및 상태 확인 --------------------------------------------------------------
  const rootPath = (): string | undefined => bookmarkPath;
  const hsCpdItms = (): boolean => cpdBms.length > 0;
  const dispose = (): void => syncService?.dispose();
  const gtBmStat = (originalPath: string): BmStat => bmStatMp.get(originalPath) || BmStat.SYNCED;
  const isRtBm = (originalPath: string): boolean => !!syncService?.getBookmark(originalPath);

  // 99. return -----------------------------------------------------------------------------
  return {
    onDidChangeTreeData: onDdChgTrDt,
    getTreeItem,
    getChildren,
    refresh,
    hasCopiedItems: hsCpdItms,
    getBookmarkStatus: gtBmStat,
    isRootBookmark: isRtBm,
    resolveRootBookmarkPath: rslvRtBmPth,
    dispose,
    addBookmark,
    removeBookmark: rmvBm,
    renameBookmark: rnmBm,
    copyBookmarks: cpyBms,
    pasteItems,
    pasteItemsToRoot: pstItmsTRt,
    createFolder,
    createFile,
    deleteOriginalItems: dltOrigItms,
    // 1-1. markExpanded
    markExpanded(path: string) {
      const key = nrmlPth(path);
      expnDrPths.add(key);
    },
    // 1-2. markCollapsed
    markCollapsed(path: string) {
      const key = nrmlPth(path);
      expnDrPths.delete(key);
    },
    get rootPath() {
      return rootPath();
    },
  };
};
