// services/BookmarkOperationService.ts

import { path, vscode } from "@exportLibs";
import { logger, notify, validateFileName as valFlNm } from "@exportScripts";
import type { BookmarkSyncServiceType as BmSyncSvcTyp } from "@exportTypes";

export const BmOpSvc = (bookmarkPath: string, _syncService?: BmSyncSvcTyp) => {
  // ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――--
  logger(`debug`, `activate - ${bookmarkPath}`);

  // 모든 파일 경로(flat) 목록을 반환 ――――――――――――――――――――――――――――――――――――――――――――――――――――――--
  const flttTFls = async (uri: vscode.Uri, visited: Set<string> = new Set()): Promise<string[]> => {
    const currentPath = process.platform === `win32` ? path.resolve(uri.fsPath).toLowerCase() : path.resolve(uri.fsPath);
    if (visited.has(currentPath)) {
    	return [];
    }
    visited.add(currentPath);

    const stat = await vscode.workspace.fs.stat(uri);
    let flttFls: string[] = [];

    if (stat.type === vscode.FileType.File) {
    	flttFls = [uri.fsPath];
    }
    else {
      const entries = await vscode.workspace.fs.readDirectory(uri);
      const nestedFiles = await Promise.all(
        entries.map(async ([name, type]) => {
          const childPath = path.join(uri.fsPath, name);
          return type === vscode.FileType.File ? [childPath] : type === vscode.FileType.Directory ? await flttTFls(vscode.Uri.file(childPath), visited) : [];
        }),
      );

      nestedFiles.forEach((filePaths) => {
        flttFls.push(...filePaths);
      });
    }
    return flttFls;
  };

  // 파일 경로 비교를 위해 정규화 ―――――――――――――――――――――――――――――――――――――――――――――――――――--
  const nrmlFrCmpr = (p: string): string => process.platform === `win32` ? path.resolve(p).toLowerCase() : path.resolve(p);
  const isSameFsPath = (a: string, b: string): boolean => nrmlFrCmpr(a) === nrmlFrCmpr(b);
  const isSubPath = (parent: string, child: string): boolean => {
    const rel = path.relative(parent, child);
    return rel.length > 0 && !rel.startsWith(`..`) && !path.isAbsolute(rel);
  };

  // 파일 또는 폴더를 대상 위치로 복사 ――――――――――――――――――――――――――――――――――――――――――――――――――――――
  const cpyFlOrFldr = async (source: string, target: string): Promise<void> => {
    const srcUri = vscode.Uri.file(source);
    const tgtUri = vscode.Uri.file(target);
    const stat = await vscode.workspace.fs.stat(srcUri);

    stat.type === vscode.FileType.File ? await (async () => {
        await vscode.workspace.fs.createDirectory(vscode.Uri.file(path.dirname(target)));
        const content = await vscode.workspace.fs.readFile(srcUri);
        await vscode.workspace.fs.writeFile(tgtUri, content);
      })() : await (async () => {
        // 대상이 원본 내부일 경우 무한 루프 또는 손상 가능성 있으므로 차단
        if (isSameFsPath(source, target) || isSubPath(source, target)) {
          logger(`error`, `copy - ${source} -> ${target}`);
          throw new Error(`Cannot copy a folder into itself or its subfolder: ${path.basename(source)}`);
        }
        try {
          await vscode.workspace.fs.delete(tgtUri, { recursive: true, useTrash: false });
        }
        catch {
          // 대상이 없으면 그대로 생성
        }

        await vscode.workspace.fs.createDirectory(tgtUri);
        const entries = await vscode.workspace.fs.readDirectory(srcUri);

        const copyPromises = entries.map(([name]) => {
          const sourcePath = path.join(source, name);
          const targetPath = path.join(target, name);
          return cpyFlOrFldr(sourcePath, targetPath);
        });

        await Promise.all(copyPromises);
      })();
  };

  // 파일/폴더 붙여넣기 (강제 덮어쓰기) - 일반 폴더 대상 ―――――――――――――――――――――――――――――――――――――――
  const pasteItems = async (copiedItems: vscode.Uri[], targetPath: string): Promise<void> => {
    const proceed = copiedItems.length > 0;

    if (!proceed) {
      notify(`error`, `paste: Nothing to paste: clipboard is empty.`);
      return;
    }

    let pasteCount = 0;
    for (const item of copiedItems) {
      const fileName = path.basename(item.fsPath);
      const targetFile = path.join(targetPath, fileName);
      const targetUri = vscode.Uri.file(targetFile);

      // 소스/대상 동일 여부 검사 (플랫폼별 정규화 포함)
      const isSame = isSameFsPath(item.fsPath, targetFile);

      if (isSame) {
        logger(`debug`, `paste - ${item.fsPath}`);
      }
      else {
        try {
          // 소스 정보 확인
          let srcStat: vscode.FileStat | undefined;
          try {
            srcStat = await vscode.workspace.fs.stat(item);
          }
          catch (_e) {
            notify(`error`, `paste - Source not found or inaccessible: ${fileName}`);
            continue;
          }
          // 폴더를 자기 자신 또는 하위 폴더로 붙여넣는 경우 차단
          if (srcStat.type === vscode.FileType.Directory && isSubPath(item.fsPath, targetFile)) {
            notify(`error`, `paste - Cannot paste a folder into itself or its subfolder: ${fileName}`);
            continue;
          }
          // 대상 파일이 존재하면 삭제
          try {
            await vscode.workspace.fs.stat(targetUri);
            await vscode.workspace.fs.delete(targetUri, {
              recursive: true,
              useTrash: false,
            });
          }
          catch {
            // 파일이 없으면 무시하고 계속 진행
          }
          // 복사 실행
          await cpyFlOrFldr(item.fsPath, targetFile);
          pasteCount++;
        }
        catch (error) {
          notify(`error`, `paste - Paste failed for ${fileName}: ${error}`);
        }
      }
    }
    const messageValue = pasteCount === 1 ? "1 item pasted (overwritten)" : `${pasteCount} items pasted (overwritten)`;
    notify(`info`, `paste - ${messageValue}`);
    logger(`debug`, `paste - ${pasteCount}`);
  };

  // 루트 붙여넣기 ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――-
  const pstItmsTRt = async (copiedItems: vscode.Uri[], nmTOrigPth: Map<string, string>, srcTOrigPth: Map<string, string> = new Map()): Promise<void> => {
    const proceed = copiedItems.length > 0;

    if (!proceed) {
      notify(`error`, `paste: Nothing to paste: clipboard is empty.`);
      return;
    }

    const srcFilesSet = new Set<string>();
    for (const uri of copiedItems) {
      const flttFls = await flttTFls(uri);
      for (const filePath of flttFls) {
        srcFilesSet.add(filePath);
      }
    }
    const srcFiles = Array.from(srcFilesSet.values());

    let ovrwCnt = 0;
    const skipped: string[] = [];
    const normSrcMp = new Map<string, string>();

    for (const [sourcePath, targetPath] of srcTOrigPth.entries()) {
      normSrcMp.set(nrmlFrCmpr(sourcePath), targetPath);
    }
    for (const src of srcFiles) {
      const fileName = path.basename(src);
      const realTarget = normSrcMp.get(nrmlFrCmpr(src)) || nmTOrigPth.get(fileName);

      if (!realTarget) {
        skipped.push(fileName);
      }
      else if (isSameFsPath(src, realTarget)) {
        logger(`debug`, `paste - ${src}`);
      }
      else {
        try {
          // 대상 파일이 존재하면 삭제
          try {
            await vscode.workspace.fs.stat(vscode.Uri.file(realTarget));
            await vscode.workspace.fs.delete(vscode.Uri.file(realTarget), { recursive: true, useTrash: false });
          }
          catch {
            // 파일이 없으면 무시하고 계속 진행
          }
          // 복사 실행
          await cpyFlOrFldr(src, realTarget);
          ovrwCnt++;
        }
        catch (error) {
          notify(`error`, `paste: Overwrite failed at original location for ${fileName}: ${String(error)}`);
        }
      }
    }

    if (ovrwCnt > 0) {
      ovrwCnt === 1 ? notify(`info`, `paste - 1 file overwritten at original location`) : notify(`info`, `paste - ${ovrwCnt} files overwritten at original locations`);
    }
    skipped.length > 0 && notify(`warn`, `paste - ${skipped.length} files skipped (no matching original names)`);
  };

  // 실제 원본 파일/폴더 삭제 ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――-
  const dltOrigFls = async (items: vscode.Uri[]): Promise<void> => {
    let deleteCount = 0;

    const dltRess = await Promise.all(items.map(async (item) => {
      try {
        await vscode.workspace.fs.delete(item, { recursive: true });
        logger(`debug`, `remove - ${item.fsPath}`);
        return true;
      }
      catch (error) {
        logger(`error`, `remove - ${item.fsPath} ${String(error)}`);
        return false;
      }
    }));
    deleteCount = dltRess.filter(Boolean).length;
    const successValue = deleteCount === 1 ? "Deleted 1 original file" : `Deleted ${deleteCount} original files`;

    notify(`info`, `remove - ${successValue}`);
  };

  // 실제 위치에 새 폴더 생성 ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――-
  const createFolder = async (parentPath: string, folderName: string): Promise<void> => {
    const error = valFlNm(folderName);

    return error ? void notify(`error`, `create - Invalid folder name: ${error}`) : await (async () => {
          const folderPath = path.join(parentPath, folderName);
          const folderUri = vscode.Uri.file(folderPath);
          let exists = true;
          try {
            await vscode.workspace.fs.stat(folderUri);
          }
          catch {
            exists = false;
          }
          exists ? notify(`warn`, `create - Folder already exists: ${folderName}`) : await (async () => {
              await vscode.workspace.fs.createDirectory(folderUri);
              notify(`info`, `create - Folder created at original location: ${folderName}`);
              logger(`debug`, `create - ${folderPath}`);
            })();
        })();
  };

  // 실제 위치에 새 파일 생성 ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
  const createFile = async (parentPath: string, fileName: string): Promise<void> => {
    const error = valFlNm(fileName);

    return error ? void notify(`error`, `create - Invalid file name: ${error}`) : await (async () => {
          const filePath = path.join(parentPath, fileName);
          const fileUri = vscode.Uri.file(filePath);
          let exists = true;
          try {
            await vscode.workspace.fs.stat(fileUri);
          }
          catch {
            exists = false;
          }
          exists ? notify(`warn`, `create - File already exists: ${fileName}`) : await (async () => {
              await vscode.workspace.fs.writeFile(fileUri, new Uint8Array(0));
              notify(`info`, `create - File created: ${fileName}`);
              logger(`debug`, `create - ${filePath}`);

              try {
                const document = await vscode.workspace.openTextDocument(fileUri);
                await vscode.window.showTextDocument(document);
              }
              catch (error) {
                logger(`error`, `create - ${fileName} ${error}`);
              }
            })();
        })();
  };

  // 북마크 폴더 경로 업데이트 ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――--
  const updtBmPth = (newPath: string): void => {
    bookmarkPath = newPath;
  };

  // 99. return ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――--
  return {
    pasteItems,
    pasteItemsToRoot: pstItmsTRt,
    deleteOriginalFiles: dltOrigFls,
    createFolder,
    createFile,
    updateBookmarkPath: updtBmPth,
  };
};
