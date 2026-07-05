// commands/BookmarkCommand.ts

import { Minimatch, path, vscode } from "@exportLibs";
import { isFileType, LRUCache, logger, notify, validateFileName as valFlNm } from "@exportScripts";
import type { BookmarkModelType as BmMdlTyp, BookmarkProviderType as BmProvTyp, ExcludeRuleType as ExclRlTyp } from "@exportTypes";

const MEEF = 250;
const CLPB_LN_PAT = /\r?\n/;
type ExpandBudget = { count: number; limited: boolean };

// ------------------------------------------------------------------------------
// 1. 북마크 명령
// ------------------------------------------------------------------------------
export const BmCmd = (provider: BmProvTyp, _context: vscode.ExtensionContext) => {
  // 0. 변수 설정 ----------------------------------------------------------------------------
  const exclRlCch = new LRUCache<string, ExclRlTyp[]>(50);
  let selBms: BmMdlTyp[] = [];
  const mnmtOpts = {
    dot: true,
    nocase: process.platform === "win32",
  } as const;

  // 1-1. when 절 추출
  const gtWhnCls = (value: boolean | { when?: string }): string | undefined => {
    const whenClause = typeof value === "object" && value ? value.when : undefined;
    return typeof whenClause === "string" ? whenClause : undefined;
  };

  // 윈도우 경로 구분자를 POSIX 형식("/")으로 변환 --------------------------------------------
  const toPosixPath = (value: string): string => value.replace(/\\/g, "/");

  // 워크스페이스 폴더 기준의 상대 경로를 구하고 POSIX 형식으로 반환 --------------------------
  const gtRltvPth = (folder: vscode.WorkspaceFolder, target: vscode.Uri): string => {
    const relative = path.relative(folder.uri.fsPath, target.fsPath);
    return relative ? toPosixPath(relative) : "";
  };

  // files.exclude 설정을 읽어 Minimatch 규칙 목록을 생성/캐시 --------------------------------
  const gtExRlTyFrFl = (folder: vscode.WorkspaceFolder): ExclRlTyp[] => {
    const cacheKey = folder.uri.toString(true);
    const cached = exclRlCch.get(cacheKey);

    return cached ? cached : (
        (() => {
          const config = vscode.workspace.getConfiguration("files", folder.uri);
          const raw = config.get<Record<string, boolean | { when?: string }>>("exclude") ?? {};
          const rules: ExclRlTyp[] = [];

          for (const [pattern, value] of Object.entries(raw)) {
            const whenClause = gtWhnCls(value);

            if (typeof value === "boolean") {
              value && rules.push({
                  matcher: new Minimatch(pattern, mnmtOpts),
                });
            }
            else if (whenClause) {
              rules.push({
                matcher: new Minimatch(pattern, mnmtOpts),
                when: whenClause,
              });
            }
          }
          exclRlCch.set(cacheKey, rules);
          return rules;
        })()
      );
  };

  // 조건부 숨김 여부를 결정 --------------------------------------------------------------------
  const evltWhnCls = async (whenClause: string, folder: vscode.WorkspaceFolder, relativePath: string): Promise<boolean> => whenClause.includes("$(basename)") ? await (async () => {
          const fileName = path.posix.basename(relativePath);
          const extension = path.posix.extname(fileName);
          const baseName = extension ? fileName.slice(0, -extension.length) : fileName;
          const substituted = whenClause.replace(/\$\(basename\)/g, baseName);
          const directory = path.posix.dirname(relativePath);
          const sblnRltv = directory === "." ? substituted : `${directory}/${substituted}`;
          const segments = sblnRltv.split("/").filter((segment) => segment.length > 0);
          const siblingUri = vscode.Uri.joinPath(folder.uri, ...segments);

          try {
            await vscode.workspace.fs.stat(siblingUri);
            return true;
          }
          catch {
            return false;
          }
        })() : false;

  // 스킵할지 여부를 판단 -----------------------------------------------------------------------
  const shldSkpEntr = async (uri: vscode.Uri, folderHint?: vscode.WorkspaceFolder, kind?: vscode.FileType): Promise<boolean> => {
    const folder = folderHint ?? vscode.workspace.getWorkspaceFolder(uri);
    return !folder ? false : (
        (() => {
          const relative = gtRltvPth(folder, uri);
          return relative.length === 0 ? false : (() => {
                const name = path.posix.basename(relative);
                return name.startsWith(".") ? true : (
                    (() => {
                      const rules = gtExRlTyFrFl(folder);
                      return rules.length === 0 ? false : (async () => {
                            const candidates = [relative];
                            !relative.startsWith("/") && candidates.push(`/${relative}`);
                            !relative.startsWith("./") && candidates.push(`./${relative}`);

                            const isDirectory = typeof kind !== "undefined" && isFileType(kind, vscode.FileType.Directory);

                            for (const rule of rules) {
                              const matched = candidates.some((candidate) => rule.matcher.match(candidate));
                              if (!matched) {
                              	continue;
                              }
                              if (!rule.when) {
                              	return true;
                              }
                              if (isDirectory) {
                              	continue;
                              }
                              if (await evltWhnCls(rule.when, folder, relative)) {
                              	return true;
                              }
                            }
                            return false;
                          })();
                    })()
                  );
              })();
        })()
      );
  };

  // 비동기 흐름 제어 -----------------------------------------------------------------------
  const delay = async (ms: number): Promise<void> => {
    await new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  };

  // 하위 경로 여부 확인 -----------------------------------------------------------------------
  const isWithinPath = (parentPath: string, targetPath: string): boolean => {
    const relative = path.relative(parentPath, targetPath);
    return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
  };
  // 1. 폴더 북마크 재귀 수집 -------------------------------------------------------------
  const cllcFldrBms = async (item?: BmMdlTyp, visited: Set<string> = new Set()): Promise<BmMdlTyp[]> => {
    const children = item ? await provider.getChildren(item) : await provider.getChildren();
    const folders: BmMdlTyp[] = [];

    for (const child of children) {
      if (child.bookmarkMetadata.isFile) {
      	continue;
      }
      const key = process.platform === "win32" ? path.resolve(child.originalPath).toLowerCase() : path.resolve(child.originalPath);

      if (visited.has(key)) {
      	continue;
      }
      visited.add(key);
      folders.push(child);
      folders.push(...(await cllcFldrBms(child, visited)));
    }
    return folders;
  };

  // 2. 폴더 펼침 상태 일괄 반영 ----------------------------------------------------------
  const stFldrExpnSt = async (expanded: boolean): Promise<void> => {
    const folders = await cllcFldrBms();

    for (const folder of folders) {
      expanded ? provider.markExpanded(folder.originalPath) : provider.markCollapsed(folder.originalPath);
    }
    provider.refresh();
  };

  // Explorer 항목을 재귀적으로 확장 ------------------------------------------------------
  const expAlExFl = async (): Promise<boolean> => {
    const budget: ExpandBudget = { count: 0, limited: false };
    try {
      await vscode.commands.executeCommand("workbench.view.explorer");
      await delay(100);

      const wsFldrs = vscode.workspace.workspaceFolders;
      if (!wsFldrs || wsFldrs.length === 0) {
        return false;
      }
      for (const folder of wsFldrs) {
        await expnFldrRcrs(folder.uri, budget);
        if (budget.limited) {
          break;
        }
      }
    }
    catch (error) {
      logger(`debug`, `select - ${error instanceof Error ? error.message : String(error)}`);
    }
    return budget.limited;
  };

  // 지정된 폴더와 하위 폴더 순차적으로 확장 --------------------------------------------------
  const expnFldrRcrs = async (folderUri: vscode.Uri, budget: ExpandBudget): Promise<void> => {
    try {
      if (budget.count >= MEEF) {
        budget.limited = true;
        return;
      }
      budget.count++;

      // 폴더를 Explorer에 표시하고 확장
      await vscode.commands.executeCommand("revealInExplorer", folderUri);
      await delay(10);
      await vscode.commands.executeCommand("list.expand");
      await delay(10);

      // 하위 폴더 찾기
      const entries = await vscode.workspace.fs.readDirectory(folderUri);
      const folder = vscode.workspace.getWorkspaceFolder(folderUri);

      const fltrEntr = await Promise.all(
        entries
          .filter(([_name, type]: [string, vscode.FileType]) => isFileType(type, vscode.FileType.Directory))
          .map(async ([name, type]: [string, vscode.FileType]) => {
            const childUri = vscode.Uri.joinPath(folderUri, name);
            const shouldSkip = await shldSkpEntr(childUri, folder, type);
            return shouldSkip ? null : childUri;
          }),
      );

      const sbDrct = fltrEntr.filter((uri: vscode.Uri | null) => uri !== null) as vscode.Uri[];

      // 하위 폴더들을 재귀적으로 확장
      for (const subDir of sbDrct) {
        if (budget.count >= MEEF) {
          budget.limited = true;
          break;
        }
        await expnFldrRcrs(subDir, budget);
      }
    }
    catch (error) {
      logger(`debug`, `expand - ${folderUri.fsPath} ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  // 선택된 아이템 업데이트 -----------------------------------------------------------------
  const updtSelBm = (items: BmMdlTyp[]): void => {
    selBms = items;
  };

  // 북마크 새로고침 -------------------------------------------------------------------------
  const rgstRfrsCmd = (): vscode.Disposable =>
    vscode.commands.registerCommand("Simple-Bookmark.refreshentry", () => {
      logger(`debug`, `select - Refresh command executed`);
      provider.refresh();
    });

  // URI 기반 북마크 추가 -----------------------------------------------------------------
  const addBmFrmUr = async (targetUri: vscode.Uri): Promise<void> => {
    const stat = await vscode.workspace.fs.stat(targetUri);
    const bookmarkName = path.basename(targetUri.fsPath);

    if (stat.type === vscode.FileType.Directory || stat.type === vscode.FileType.File) {
      await provider.addBookmark(targetUri.fsPath, bookmarkName);
      provider.refresh();
    }
    else {
      notify(`error`, `add - Only files or folders can be added.`);
    }
  };

  // 북마크 추가 (Explorer 선택 기반) --------------------------------------------------------
  const rgstAddBmCmd = (): vscode.Disposable =>
    vscode.commands.registerCommand("Simple-Bookmark.addbookmark", async (uri?: vscode.Uri) => {
      if (uri) {
        await addBmFrmUr(uri);
      }
      else {
        await vscode.commands.executeCommand("copyFilePath");
        const copied = await vscode.env.clipboard.readText();
        const picked = copied ? vscode.Uri.file(copied.split(CLPB_LN_PAT)[0]) : undefined;

        if (picked) {
          await addBmFrmUr(picked);
        }
        else {
          notify(`error`, `add - No file or folder selected in Explorer.`);
        }
      }
    });

  // 북마크 제거 (북마크만 또는 북마크 + 원본 선택 삭제) -----------------------------------------------
  const rgstRmvBmCmd = (): vscode.Disposable =>
    vscode.commands.registerCommand("Simple-Bookmark.removebookmark", async (item?: BmMdlTyp, selItms?: BmMdlTyp[]) => {
      const commandItems = selItms && selItms.length > 0 ? selItms : item ? [item] : selBms;
      const cnddItms = Array.from(new Map(commandItems.map((candidate) => [candidate.originalPath, candidate])).values());
      const rtBmTrgt = new Set<string>();
      const origOnlyTrgt = new Set<string>();

      for (const candidate of cnddItms) {
        provider.isRootBookmark(candidate.originalPath) ? rtBmTrgt.add(candidate.originalPath) : candidate.isOriginalAvailable && origOnlyTrgt.add(candidate.originalPath);
      }
      const itmsTRmv: string[] = Array.from(rtBmTrgt.values());
      const srtdRtTrgt = itmsTRmv.sort((a, b) => a.length - b.length);
      const origItmsTRmv: string[] = Array.from(origOnlyTrgt.values()).filter((targetPath) => !srtdRtTrgt.some((rootPath) => isWithinPath(rootPath, targetPath)));

      return itmsTRmv.length === 0 && origItmsTRmv.length === 0 ? notify(`error`, `remove - 삭제할 북마크가 선택되지 않았습니다.`) : await (async () => {
            let rmvBmWtOr = false;

            if (itmsTRmv.length > 0) {
              const config = vscode.workspace.getConfiguration("Simple-Bookmark");
              const deleteMode = config.get<string>("deleteMode", "ask");

              let dltOrig: boolean = false;

              if (deleteMode === "bookmarkOnly") {
              	dltOrig = false;
              }
              else if (deleteMode === "bookmarkAndOriginal") {
              	dltOrig = true;
              }
              else {
                const itmCntTxt = itmsTRmv.length === 1 ? "1 bookmark" : `${itmsTRmv.length} bookmarks`;

                const choice = await vscode.window.showWarningMessage(`How would you like to delete ${itmCntTxt}?`, { modal: true }, "Bookmark Only", "Bookmark + Original File");

                if (!choice) {
                	return;
                }
                dltOrig = choice === "Bookmark + Original File";
              }
              await Promise.all(itmsTRmv.map((originalPath) => provider.removeBookmark(originalPath, dltOrig)));
              rmvBmWtOr = dltOrig;
            }
            if (origItmsTRmv.length > 0) {
              const itmCntTxt = origItmsTRmv.length === 1 ? "1 original item" : `${origItmsTRmv.length} original items`;
              const choice = await vscode.window.showWarningMessage(`Delete ${itmCntTxt} inside bookmarked folders?`, { modal: true }, "Delete Original");

              if (!choice) {
              	return;
              }
              await provider.deleteOriginalItems(origItmsTRmv);
            }
            provider.refresh();

            itmsTRmv.length > 0 && (() => {
                const sccsMsg = itmsTRmv.length === 1 ? rmvBmWtOr ? "Bookmark and original file deleted" : "Bookmark deleted" : rmvBmWtOr ? `${itmsTRmv.length} bookmarks and original files deleted` : `${itmsTRmv.length} bookmarks deleted`;

                notify(`info`, `remove - ${sccsMsg}`);
              })();
          })();
    });

  // 북마크 이름 변경 (루트뿐 아니라 모든 상황에서 허용) -----------------------------------------
  const rgstRnmBmCmd = (): vscode.Disposable =>
    vscode.commands.registerCommand("Simple-Bookmark.renamebookmark", async (item?: BmMdlTyp) => {
      const target: BmMdlTyp | undefined = item || (selBms.length > 0 ? selBms[0] : undefined);

      return !target ? notify(`error`, `rename - No bookmark selected to rename.`) : await (async () => {
            const currentName = target.bookmarkMetadata.bookmarkName;

            const newName = await vscode.window.showInputBox({
              prompt: "[Simple-Bookmark] Enter new bookmark name",
              value: currentName,
              validateInput: (v: string) => valFlNm(v),
            });

            return !newName ? void 0 : (
                await (async () => {
                  await provider.renameBookmark(target.originalPath, newName.trim());
                  provider.refresh();
                  notify(`info`, `rename - Renamed: ${currentName} → ${newName.trim()}`);
                })()
              );
          })();
    });

  // 복사 ----------------------------------------------------------------------------------
  const rgstCpyBmCmd = (): vscode.Disposable =>
    vscode.commands.registerCommand("Simple-Bookmark.copybookmark", (item?: BmMdlTyp, selected?: BmMdlTyp[]) => {
      let targets: BmMdlTyp[] = Array.isArray(selected) && selected.length > 0 ? selected : selBms.length > 0 ? selBms : item ? [item] : [];

      return targets.length === 0 ? notify(`error`, `copy - No items selected to copy.`) : (() => {
            const dedupMap = new Map<string, BmMdlTyp>();
            for (const t of targets) {
              !dedupMap.has(t.originalPath) && dedupMap.set(t.originalPath, t);
            }
            targets = Array.from(dedupMap.values());

            const available = targets.filter((t) => t.isOriginalAvailable);
            return available.length === 0 ? notify(`warn`, `copy - No available original files to copy.`) : (() => {
                  updtSelBm(available);
                  provider.copyBookmarks(available);
                  provider.refresh();
                })();
          })();
    });

  // 붙여넣기 ---------------------------------------------------------------------------
  const rgstPstBmCmd = (): vscode.Disposable =>
    vscode.commands.registerCommand("Simple-Bookmark.pastebookmark", async (item?: BmMdlTyp) => {
      if (!provider.hasCopiedItems()) {
        notify(`error`, `paste - Nothing to paste: clipboard is empty.`);
        return;
      }

      if (!item && selBms.length === 0) {
        await provider.pasteItemsToRoot();
        provider.refresh();
        return;
      }

      let targetPath: string | undefined;
      if (item) {
        updtSelBm([item]);
        targetPath = !item.bookmarkMetadata.isFile && item.isOriginalAvailable ? item.originalPath : path.dirname(item.originalPath);
      }
      else if (selBms.length > 0) {
        const folder = selBms.find((s) => !s.bookmarkMetadata.isFile && s.isOriginalAvailable);
        targetPath = folder ? folder.originalPath : path.dirname(selBms[0].originalPath);
      }
      else {
        targetPath = provider.rootPath;
      }

      if (targetPath) {
        logger(`debug`, `paste - ${targetPath}`);
        await provider.pasteItems(targetPath);
        provider.refresh();
      }
      else {
        notify(`warn`, `paste - Select a valid target folder to paste into.`);
      }
    });

  // 붙여넣기(루트 전용) -----------------------------------------------------------------
  const rgsPsTRtBmCm = (): vscode.Disposable =>
    vscode.commands.registerCommand("Simple-Bookmark.pasterootbookmark", async () => !provider.hasCopiedItems() ? notify(`error`, `paste - Nothing to paste: clipboard is empty.`) : await (async () => {
            await provider.pasteItemsToRoot();
            provider.refresh();
          })());

  // 모든 북마크 삭제 --------------------------------------------------------------------
  const rgsDlAlBmCm = (): vscode.Disposable =>
    vscode.commands.registerCommand("Simple-Bookmark.removeallbookmark", async () => {
      const allItems = await provider.getChildren();

      return !allItems || allItems.length === 0 ? notify(`info`, `remove - 삭제할 북마크가 없습니다.`) : await (async () => {
            const config = vscode.workspace.getConfiguration("Simple-Bookmark");
            const deleteMode = config.get<string>("deleteMode", "ask");

            let dltOrig: boolean = false;

            if (deleteMode === "bookmarkOnly") {
            	dltOrig = false;
            }
            else if (deleteMode === "bookmarkAndOriginal") {
            	dltOrig = true;
            }
            else {
              const choice = await vscode.window.showWarningMessage(`How would you like to delete all ${allItems.length} bookmarks?`, { modal: true }, "Bookmark Only", "Bookmark + Original File");

              if (!choice) {
              	return;
              }
              dltOrig = choice === "Bookmark + Original File";
            }
            await Promise.all(allItems.map((item) => provider.removeBookmark(item.originalPath, dltOrig)));
            provider.refresh();

            const sccsMsg = dltOrig ? `All ${allItems.length} bookmarks and original files deleted` : `All ${allItems.length} bookmarks deleted`;

            notify(`info`, `remove - ${sccsMsg}`);
          })();
    });

  // 폴더 생성 --------------------------------------------------------------------------
  const rgsCrFlCm = (): vscode.Disposable =>
    vscode.commands.registerCommand("Simple-Bookmark.createfolder", async (item?: BmMdlTyp) => {
      const folderName = await vscode.window.showInputBox({
        prompt: "[Simple-Bookmark] Enter folder name (will be created in original location)",
        validateInput: valFlNm,
      });

      return !folderName ? void 0 : (
          await (async () => {
            const parentPath: string | undefined = item && !item.bookmarkMetadata.isFile && item.isOriginalAvailable ? item.originalPath : (
                  await vscode.window.showOpenDialog({
                    canSelectFiles: false,
                    canSelectFolders: true,
                    canSelectMany: false,
                    openLabel: "[Simple-Bookmark] Select Parent Folder",
                  })
                )?.[0]?.fsPath;

            if (parentPath) {
              await provider.createFolder(parentPath, folderName.trim());
              provider.refresh();
            }
            else {
              notify(`warn`, `create - Select a valid parent folder.`);
            }
          })()
        );
    });

  // 파일 생성 --------------------------------------------------------------------------
  const rgstCrtFlCmd = (): vscode.Disposable =>
    vscode.commands.registerCommand("Simple-Bookmark.createfile", async (item?: BmMdlTyp) => {
      const fileName = await vscode.window.showInputBox({
        prompt: "[Simple-Bookmark] Enter file name (will be created in original location)",
        validateInput: valFlNm,
      });

      return !fileName ? void 0 : (
          await (async () => {
            const parentPath: string | undefined = item && !item.bookmarkMetadata.isFile && item.isOriginalAvailable ? item.originalPath : (
                  await vscode.window.showOpenDialog({
                    canSelectFiles: false,
                    canSelectFolders: true,
                    canSelectMany: false,
                    openLabel: "[Simple-Bookmark] Select Parent Folder",
                  })
                )?.[0]?.fsPath;

            if (parentPath) {
              await provider.createFile(parentPath, fileName.trim());
              provider.refresh();
            }
            else {
              notify(`warn`, `create - Select a valid parent folder.`);
            }
          })()
        );
    });

  // 3. 선택 폴더 펼침 ------------------------------------------------------------------
  const rgsExBmFlCm = (): vscode.Disposable =>
    vscode.commands.registerCommand("Simple-Bookmark.expandbookmarkfolder", async (item?: BmMdlTyp) => {
      const target: BmMdlTyp | undefined = item || (selBms.length > 0 ? selBms[0] : undefined);

      if (!target) {
        notify(`warn`, `expand - No bookmark folder selected.`);
      }
      else if (target.bookmarkMetadata.isFile) {
        notify(`warn`, `expand - Selected bookmark is not a folder.`);
      }
      else {
        provider.markExpanded(target.originalPath);
        provider.refresh();
      }
    });

  // 4. 전체 북마크 펼침 -----------------------------------------------------------------
  const rgsExAlBmCm = (): vscode.Disposable =>
    vscode.commands.registerCommand("Simple-Bookmark.expandallbookmarks", async () => {
      await stFldrExpnSt(true);
    });

  // 5. 전체 북마크 접힘 -----------------------------------------------------------------
  const rgsClAlBmCm = (): vscode.Disposable =>
    vscode.commands.registerCommand("Simple-Bookmark.collapseallbookmarks", async () => {
      await stFldrExpnSt(false);
    });
  // 탐색기 전체 확장 ------------------------------------------------------------------
  const rgsExExCm = (): vscode.Disposable =>
    vscode.commands.registerCommand("Simple-Bookmark.expandexplorer", async () => {
      logger(`debug`, `select - registerExpandExplorerCommand`);

      const folders = vscode.workspace.workspaceFolders;

      return !folders || folders.length === 0 ? notify(`warn`, `select - No workspace folder available to expand.`) : await (async () => {
            await vscode.commands.executeCommand("workbench.view.explorer");
            exclRlCch.clear();

            // 새로운 간소화된 전체 확장 방법 사용
            const limited = await expAlExFl();
            limited ? notify(`warn`, `expand - Stopped after ${MEEF} folders to protect VS Code responsiveness.`) : notify(`info`, `select - Explorer expanded for all workspace folders.`);
          })();
    });

  // 특정 폴더 확장 ---------------------------------------------------------------------
  const rgsExFlCm = (): vscode.Disposable =>
    vscode.commands.registerCommand("Simple-Bookmark.expandfolder", async (uri: vscode.Uri) => {
      logger(`debug`, `expand - ${uri?.fsPath}`);

      // URI가 전달되지 않은 경우 (키보드 단축키로 실행한 경우) 현재 활성 편집기의 파일 사용
      if (!uri) {
        const activeEditor = vscode.window.activeTextEditor;
        // 현재 열린 파일의 디렉토리 사용
        if (activeEditor && activeEditor.document.uri.scheme === "file") {
        	uri = vscode.Uri.file(path.dirname(activeEditor.document.uri.fsPath));
        }
        // 활성 편집기가 없으면 첫 번째 워크스페이스 폴더 사용
        else {
          const wsFldrs = vscode.workspace.workspaceFolders;
          if (wsFldrs && wsFldrs.length > 0) {
          	uri = wsFldrs[0].uri;
          }
          else {
          	notify(`warn`, `select - No folder available to expand.`);
            return;
          }
        }
      }
      try {
        // 폴더인지 확인
        const stat = await vscode.workspace.fs.stat(uri);
        if (!(stat.type & vscode.FileType.Directory)) {
          notify(`warn`, `select - Selected item is not a folder: ${uri.fsPath}`);
          return;
        }
        // Explorer 뷰로 이동
        await vscode.commands.executeCommand("workbench.view.explorer");
        await delay(100);

        // 폴더와 모든 하위 폴더를 확장
        logger(`debug`, `expand - ${uri.fsPath}`);
        const budget: ExpandBudget = { count: 0, limited: false };
        await expnFldrRcrs(uri, budget);

        budget.limited ? notify(`warn`, `expand - Stopped after ${MEEF} folders to protect VS Code responsiveness.`) : notify(`info`, `expand - Expanded: ${path.basename(uri.fsPath)}`);
      }
      catch (error) {
        logger(`debug`, `expand - ${error}`);
        notify(`error`, `expand - ${error}`);
      }
    });

  // 99. return -----------------------------------------------------------------------------
  return {
    updateSelectedBookmark: updtSelBm,
    registerCommands: (): vscode.Disposable[] => [rgstRfrsCmd(), rgstAddBmCmd(), rgstRmvBmCmd(), rgstRnmBmCmd(), rgstCpyBmCmd(), rgstPstBmCmd(), rgsPsTRtBmCm(), rgsDlAlBmCm(), rgsCrFlCm(), rgstCrtFlCmd(), rgsExBmFlCm(), rgsExAlBmCm(), rgsClAlBmCm(), rgsExExCm(), rgsExFlCm()],
  };
};
