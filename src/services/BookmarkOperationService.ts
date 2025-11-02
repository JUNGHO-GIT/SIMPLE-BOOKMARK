// services/BookmarkOperationService.ts

import { vscode, path } from "@importLibs";
import type { BookmarkSyncServiceType } from "@importTypes";
import { fnValidateFileName, fnNotification, fnLogging } from "@importScripts";

// -----------------------------------------------------------------------------------------
export const BookmarkOperationService = (
	bookmarkPath : string,
	syncService? : BookmarkSyncServiceType
) => {

	// -----------------------------------------------------------------------------------------
	fnLogging(`activate`, `${bookmarkPath}`, `debug`);
	fnLogging(`activate`, `syncService initialized`, `debug`);

	// 모든 파일 경로(flat) 목록을 반환 --------------------------------------------------------
	const flattenToFiles = async (uri: vscode.Uri): Promise<string[]> => {
		const stat = await vscode.workspace.fs.stat(uri);
		return stat.type === vscode.FileType.File
		? [uri.fsPath]
		: await (async () => {
			const out: string[] = [];
			const entries = await vscode.workspace.fs.readDirectory(uri);
			for (const [name] of entries) {
				const child = vscode.Uri.file(path.join(uri.fsPath, name));
				const childStat = await vscode.workspace.fs.stat(child);
				childStat.type === vscode.FileType.File
					? out.push(child.fsPath)
					: (await flattenToFiles(child)).forEach((p) => out.push(p));
			}
			return out;
		})();
	};

	// 파일 경로 비교를 위해 정규화 -----------------------------------------------------
	const normalizeForCompare = (
		p: string
	): string => {
		return process.platform === `win32` ? path.resolve(p).toLowerCase() : path.resolve(p);
	};
	const isSameFsPath = (
		a: string,
		b: string
	): boolean => {
		return normalizeForCompare(a) === normalizeForCompare(b);
	};
	const isSubPath = (
		parent: string,
		child: string
	): boolean => {
		const rel = path.relative(parent, child);
		return rel.length > 0 && !rel.startsWith(`..`) && !path.isAbsolute(rel);
	};

	// 파일 또는 폴더를 대상 위치로 복사 ------------------------------------------------------
	const copyFileOrFolder = async (
		source: string,
		target: string
	): Promise<void> => {
		const srcUri = vscode.Uri.file(source);
		const tgtUri = vscode.Uri.file(target);
		const stat = await vscode.workspace.fs.stat(srcUri);

		stat.type === vscode.FileType.File ? await (async () => {
			const content = await vscode.workspace.fs.readFile(srcUri);
			await vscode.workspace.fs.writeFile(tgtUri, content);
		})() : await (async () => {

			// 대상이 원본 내부일 경우 무한 루프 또는 손상 가능성 있으므로 차단
			if (isSameFsPath(source, target) || isSubPath(source, target)) {
				fnLogging(`copy`, `${source} -> ${target}`, `error`);
			}
			await vscode.workspace.fs.delete(tgtUri, {recursive: true});

			await vscode.workspace.fs.createDirectory(tgtUri);
			const entries = await vscode.workspace.fs.readDirectory(srcUri);

			const copyPromises = entries.map(([name]) => {
				const sourcePath = path.join(source, name);
				const targetPath = path.join(target, name);
				return copyFileOrFolder(sourcePath, targetPath);
			});

			await Promise.all(copyPromises);
		})();
	};

	// 파일/폴더 붙여넣기 (강제 덮어쓰기) - 일반 폴더 대상 ---------------------------------------
	const pasteItems = async (
		copiedItems : vscode.Uri[],
		targetPath : string
	) : Promise<void> => {
		const proceed = copiedItems.length > 0;

		return !proceed
			? fnNotification(`paste`, "No items to paste.", `error`)
		: await (async () => {
			let pasteCount = 0;

			for (const item of copiedItems) {
				const fileName = path.basename(item.fsPath);
				const targetFile = path.join(targetPath, fileName);
				const targetUri = vscode.Uri.file(targetFile);

				// 소스/대상 동일 여부 검사 (플랫폼별 정규화 포함)
				const isSame = isSameFsPath(item.fsPath, targetFile);

				isSame
				? fnLogging(`paste`, `${item.fsPath}`, `debug`)
				: await (async () => {
					try {
						// 소스 정보 확인
						let srcStat: vscode.FileStat | undefined;
						try {
							srcStat = await vscode.workspace.fs.stat(item);
						}
						catch (e) {
							fnNotification(`paste`, `source missing or inaccessible ${item.fsPath}`, `error`);
							return;
						}

						// 폴더를 자기 자신 또는 하위 폴더로 붙여넣는 경우 차단
						if (srcStat.type === vscode.FileType.Directory && isSubPath(item.fsPath, targetFile)) {
							fnNotification(`paste`, `cannot paste folder into itself or its subfolder ${fileName}`, `error`);
							return;
						}

						// 대상 파일이 존재하면 삭제
						try {
							await vscode.workspace.fs.stat(targetUri);
							await vscode.workspace.fs.delete(targetUri, {recursive : true, useTrash : false});
						}
						catch {
							// 파일이 없으면 무시하고 계속 진행
						}

						// 복사 실행
						await copyFileOrFolder(item.fsPath, targetFile);
						pasteCount++;
					}
					catch (error) {
						fnNotification(`paste`, `paste failed for ${fileName} ${error}`, `error`);
					}
				})();
			}

			const messageValue = pasteCount === 1
			? "Item pasted (overwritten)"
			: `${pasteCount} items pasted (overwritten)`;
			fnNotification(`paste`, messageValue, `info`);
			fnLogging(`paste`, `${pasteCount}`, `debug`);
		})();
	};

	// 루트 붙여넣기: 파일명 매칭 → 각 북마크의 실제 경로에 덮어쓰기 ----------------------------
	const pasteItemsToRoot = async (
		copiedItems : vscode.Uri[],
		nameToOriginalPath : Map<string, string>
	) : Promise<void> => {
		const proceed = copiedItems.length > 0;

		return !proceed
			? fnNotification(`paste`, "No items to paste.", `error`)
		: await (async () => {

			const srcFilesSet = new Set<string>();
			for (const uri of copiedItems) {
				(await flattenToFiles(uri)).forEach((f: string) => srcFilesSet.add(f));
			}
			const srcFiles = Array.from(srcFilesSet.values());

			let overwriteCount = 0;
			const skipped : string[] = [];

			for (const src of srcFiles) {
				const fileName = path.basename(src);
				const realTarget = nameToOriginalPath.get(fileName);

				!realTarget
				? skipped.push(fileName)
				: (isSameFsPath(src, realTarget)
					? fnLogging(`paste`, `${src}`, `debug`)
					: await (async () => {
						try {
							// 대상 파일이 존재하면 삭제
							try {
								await vscode.workspace.fs.stat(vscode.Uri.file(realTarget));
								await vscode.workspace.fs.delete(vscode.Uri.file(realTarget), {recursive : true, useTrash : false});
							}
							// 파일이 없으면 무시하고 계속 진행
							catch {
							}

							// 복사 실행
							await copyFileOrFolder(src, realTarget);
							overwriteCount++;
						}
						catch (error) {
							fnNotification(`paste`, `root overwrite failed for ${fileName} ${error}`, `error`);
						}
					})()
				);
			}

			overwriteCount > 0 && (
				overwriteCount === 1 ? (
					fnNotification(`paste`, `1 file overwritten to original targets`, `info`)
				) : (
					fnNotification(`paste`, `${overwriteCount} files overwritten to original targets`, `info`)
				)
			);
			skipped.length > 0 && fnNotification(`paste`, `${skipped.length} files skipped (non-matching names)`, `warn`);
		})();
	};

	// 실제 원본 파일/폴더 삭제 -------------------------------------------------------------
	const deleteOriginalFiles = async (
		items : vscode.Uri[]
	) : Promise<void> => {
		let deleteCount = 0;

		for (const item of items) {
			try {
				await vscode.workspace.fs.delete(item, {recursive : true});
				deleteCount++;
				fnLogging(`remove`, `${item.fsPath}`, `debug`);
			}
			catch (error) {
				fnLogging(`remove`, `${item.fsPath} ${error}`, `error`);
			}
		}

		const successValue = deleteCount === 1
		? "Original file deleted"
		: `${deleteCount}`;

		fnNotification(`remove`, successValue, `info`);
	};

	// 실제 위치에 새 폴더 생성 -------------------------------------------------------------
	const createFolder = async (
		parentPath : string,
		folderName : string
	) : Promise<void> => {
		const error = fnValidateFileName(folderName);

		return error
			? void fnNotification(`create`, `${error}`, `error`)
		: await (async () => {
			const folderPath = path.join(parentPath, folderName);
			const folderUri = vscode.Uri.file(folderPath);
			let exists = true;
			try {
				await vscode.workspace.fs.stat(folderUri);
			}
			catch {
				exists = false;
			}
			exists
					? fnNotification(`create`, `folder already exists ${folderName}`, `warn`)
			: await (async () => {
				await vscode.workspace.fs.createDirectory(folderUri);
						fnNotification(`create`, `folder created in original location ${folderName}`, `info`);
						fnLogging(`create`, `${folderPath}`, `debug`);
			})();
		})();
	};

	// 실제 위치에 새 파일 생성 ---------------------------------------------------------------
	const createFile = async (
		parentPath : string,
		fileName : string
	) : Promise<void> => {
		const error = fnValidateFileName(fileName);

		return error
			? void fnNotification(`create`, `${error}`, `error`)
		: await (async () => {
			const filePath = path.join(parentPath, fileName);
			const fileUri = vscode.Uri.file(filePath);
			let exists = true;
			try {
				await vscode.workspace.fs.stat(fileUri);
			}
			catch {
				exists = false;
			}
			exists
						? fnNotification(`create`, `${fileName}`, `warn`)
			: await (async () => {
				await vscode.workspace.fs.writeFile(fileUri, new Uint8Array(0));
						fnNotification(`create`, `${fileName}`, `info`);
						fnLogging(`create`, `${filePath}`, `debug`);

				try {
					const document = await vscode.workspace.openTextDocument(fileUri);
					await vscode.window.showTextDocument(document);
				}
				catch (error) {
					fnLogging(`create`, `${fileName} ${error}`, `error`);
				}
			})();
		})();
	};

	// 파일 변경 감지 (존재 여부 확인) ----------------------------------------------------
	const checkForChanges = async (
		filePaths : string[]
	) : Promise<string[]> => {
		const changedFiles : string[] = [];

		for (const filePath of filePaths) {
			try {
				await vscode.workspace.fs.stat(vscode.Uri.file(filePath));
			}
			catch {
				changedFiles.push(filePath);
			}
		}

		return changedFiles;
	};

	// 북마크 폴더 경로 업데이트 -----------------------------------------------------------
	const updateBookmarkPath = (
		newPath : string
	) : void => {
		bookmarkPath = newPath;
	};

	// 99. return -----------------------------------------------------------------------------
	return {
		pasteItems,
		pasteItemsToRoot,
		deleteOriginalFiles,
		createFolder,
		createFile,
		checkForChanges,
		updateBookmarkPath,
	};
};
