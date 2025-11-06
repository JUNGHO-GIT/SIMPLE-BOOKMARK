// autofix.cjs

const { spawnSync } = require(`child_process`);
const fs = require(`fs`);
const path = require(`path`);
const process = require(`process`);
const { Project } = require(`ts-morph`);

// 0. 상수 정의 ------------------------------------------------------------------------------------
const LINE_REGEX = /^(?<file>.+):(?<line>\d+)\s*-\s*(?<name>.+?)(?:\s*\((?<note>.+)\))?$/;

// 로깅 함수 -----------------------------------------------------------------------------------
const fnLogger = (type=``, ...args) => {
	type === `info` && (() => {
		console.log(`[INFO] ${args[0]}`);
	})();
	type === `success` && (() => {
		console.log(`[SUCCESS] ${args[0]}`);
	})();
	type === `warn` && (() => {
		console.warn(`[WARN] ${args[0]}`);
	})();
	type === `error` && (() => {
		console.error(`[ERROR] ${args[0]}`);
	})();
	type === `step` && (() => {
		console.log(`[STEP] ${args[0]} - ${args[1]}`);
	})();
};

// 1. 명령행 인수 파싱 -------------------------------------------------------------------------
const fnParseArgs = (argv=[]) => {
	fnLogger(`step`, `1`, `명령행 인수 파싱 시작`);

	const args = {
		project: `tsconfig.json`,
		apply: false,
		ignore: [],
		skip: [],
		include: [],
		exclude: [],
		report: null,
		skipUsedInModule: true,
		backup: false
	};

	for (let i = 2; i < argv.length; i += 1) {
		const currentArg = argv[i];
		currentArg === `--project` ? (args.project = argv[++i]) :
		currentArg === `--apply` ? (args.apply = true) :
		currentArg === `--ignore` ? args.ignore.push(argv[++i]) :
		currentArg === `--skip` ? args.skip.push(argv[++i]) :
		currentArg === `--include` ? args.include.push(argv[++i]) :
		currentArg === `--exclude` ? args.exclude.push(argv[++i]) :
		currentArg === `--report` ? (args.report = argv[++i]) :
		currentArg === `--no-uim` ? (args.skipUsedInModule = false) :
		currentArg === `--backup` ? (args.backup = true) :
		fnLogger(`warn`, `알 수 없는 플래그 무시: ${currentArg}`);
	}

	fnLogger(`info`, `파싱된 설정: project=${args.project}, apply=${args.apply}, backup=${args.backup}`);
	return args;
};

// 유틸리티 함수 -------------------------------------------------------------------------------
const fnWithLocalBinOnPath = (env={}) => {
	const binDir = path.join(process.cwd(), `node_modules`, `.bin`);
	const pathParts = (env.PATH || env.Path || ``).split(path.delimiter).filter(Boolean);
	!pathParts.includes(binDir) && pathParts.unshift(binDir);

	const newEnv = { ...env };
	process.platform === `win32` ? (
		newEnv.Path = pathParts.join(path.delimiter)
	) : (
		newEnv.PATH = pathParts.join(path.delimiter)
	);

	return newEnv;
};

// -----------------------------------------------------------------------------------------------
const fnTrySpawn = (cmd=``, args=[], opts={}) => {
	const result = spawnSync(cmd, args, {
		encoding: `utf8`,
		env: fnWithLocalBinOnPath(process.env),
		...opts
	});
	return result;
};

// -----------------------------------------------------------------------------------------------
const fnResolveTsPruneBinJs = () => {
	fnLogger(`info`, `ts-prune 바이너리 경로 해석 시도`);

	try {
		const packagePath = require.resolve(`ts-prune/package.json`, { paths: [process.cwd()] });
		const packageDir = path.dirname(packagePath);
		const packageJson = JSON.parse(fs.readFileSync(packagePath, `utf8`));
		let binRelative = null;

		typeof packageJson.bin === `string` ? (
			binRelative = packageJson.bin
		) : packageJson.bin && typeof packageJson.bin === `object` ? (
			packageJson.bin[`ts-prune`] ? (
				binRelative = packageJson.bin[`ts-prune`]
			) : Object.keys(packageJson.bin).length > 0 && (
				binRelative = packageJson.bin[Object.keys(packageJson.bin)[0]]
			)
		) : null;

		!binRelative && (() => {
			fnLogger(`warn`, `package.json에서 bin 정보를 찾을 수 없음`);
			return null;
		})();

		const binAbsolute = path.resolve(packageDir, binRelative);
		const exists = fs.existsSync(binAbsolute);
		fnLogger(`info`, `바이너리 경로: ${binAbsolute}, 존재: ${exists}`);
		return exists ? binAbsolute : null;
	}
	catch (error) {
		fnLogger(`error`, `ts-prune 패키지 해석 실패: ${error instanceof Error ? error.message : String(error)}`);
		return null;
	}
};

// 2. ts-prune 실행 ---------------------------------------------------------------------------
const fnRunTsPrune = (args={}) => {
	fnLogger(`step`, `2`, `ts-prune 실행 시작`);

	const cliArgs = [`-p`, args.project];
	args.skipUsedInModule && cliArgs.push(`-u`);
	args.ignore.forEach((pattern) => cliArgs.push(`-i`, pattern));
	args.skip.forEach((pattern) => cliArgs.push(`-s`, pattern));

	fnLogger(`info`, `ts-prune 명령행 인수: ${cliArgs.join(` `)}`);
	const errors = [];

	const binJs = fnResolveTsPruneBinJs();
	binJs && (() => {
		fnLogger(`info`, `Node.js 바이너리로 ts-prune 실행 시도`);
		const result = fnTrySpawn(process.execPath, [binJs, ...cliArgs]);

		!result.error ? (() => {
			const okStatus = typeof result.status === `number` ? result.status === 0 : true;
			const hasOutput = typeof result.stdout === `string` && result.stdout.trim().length > 0;

			(okStatus || hasOutput) ? (() => {
				fnLogger(`success`, `Node.js 바이너리 실행 성공`);
				return result.stdout;
			})() : (() => {
				errors.push(`[node-bin] exited ${result.status} stdout:"${(result.stdout || ``).trim()}" stderr:"${(result.stderr || ``).trim()}"`);
			})();
		})() : (() => {
			const errorCode = result.error && typeof result.error === `object` && `code` in result.error ? result.error.code : `ERR`;
			const errorMessage = result.error ? result.error.message || `` : ``;
			errors.push(`[node-bin] ${errorCode} ${errorMessage.trim()}`);
		})();
	})();

	const executionMethods = [
		{
			name: `local-bin`,
			getPath: () => path.join(process.cwd(), `node_modules`, `.bin`, process.platform === `win32` ? `ts-prune.cmd` : `ts-prune`),
			getCommand: (binPath) => [binPath, cliArgs]
		},
		{
			name: `pnpm-exec`,
			getPath: () => process.platform === `win32` ? `pnpm.cmd` : `pnpm`,
			getCommand: (cmd) => [cmd, [`exec`, `ts-prune`, ...cliArgs]]
		},
		{
			name: `npx`,
			getPath: () => process.platform === `win32` ? `npx.cmd` : `npx`,
			getCommand: (cmd) => [cmd, [`ts-prune`, ...cliArgs]]
		},
		{
			name: `path-ts-prune`,
			getPath: () => process.platform === `win32` ? `ts-prune.cmd` : `ts-prune`,
			getCommand: (cmd) => [cmd, cliArgs]
		}
	];

	for (const method of executionMethods) {
		const commandPath = method.getPath();
		const [cmd, methodArgs] = method.getCommand(commandPath);

		method.name === `local-bin` && !fs.existsSync(commandPath) && (() => {
			errors.push(`[${method.name}] ${commandPath} 없음`);
			return;
		})();

		fnLogger(`info`, `${method.name}으로 ts-prune 실행 시도`);
		const result = fnTrySpawn(cmd, methodArgs);

		!result.error ? (() => {
			const okStatus = typeof result.status === `number` ? result.status === 0 : true;
			const hasOutput = typeof result.stdout === `string` && result.stdout.trim().length > 0;

			(okStatus || hasOutput) ? (() => {
				fnLogger(`success`, `${method.name} 실행 성공`);
				return result.stdout;
			})() : (() => {
				errors.push(`[${method.name}] exited ${result.status} stdout:"${(result.stdout || ``).trim()}" stderr:"${(result.stderr || ``).trim()}"`);
			})();
		})() : (() => {
			const errorCode = result.error && typeof result.error === `object` && `code` in result.error ? result.error.code : `ERR`;
			const errorMessage = result.error ? result.error.message || `` : ``;
			errors.push(`[${method.name}] ${errorCode} ${errorMessage.trim()}`);
		})();
	}

	const errorMessage = `ts-prune 실행 실패:\n${errors.map((e) => ` - ${e}`).join(`\n`)}`;
	fnLogger(`error`, errorMessage);
	throw new Error(errorMessage);
};

// 3. ts-prune 출력 파싱 -----------------------------------------------------------------------
const fnParseTsPruneOutput = (text=``) => {
	fnLogger(`step`, `3`, `ts-prune 출력 파싱 시작`);

	const output = [];
	const lines = text.split(/\r?\n/);

	for (const rawLine of lines) {
		const line = rawLine.trim();
		line.length === 0 && (() => {
			continue;
		})();

		const match = LINE_REGEX.exec(line);
		(!match || !match.groups) && (() => {
			continue;
		})();

		const fileNormalized = path.normalize(match.groups.file);
		const symbolName = match.groups.name.trim();
		const note = match.groups.note ? match.groups.note.trim() : null;
		output.push({ file: fileNormalized, name: symbolName, note });
	}

	fnLogger(`info`, `파싱된 항목 수: ${output.length}`);
	return output;
};

// 4. 경로 필터링 ------------------------------------------------------------------------------
const fnFilterByPath = (items=[], include=[], exclude=[]) => {
	fnLogger(`step`, `4`, `경로 필터링 시작`);

	(include.length === 0 && exclude.length === 0) && (() => {
		fnLogger(`info`, `필터링 조건 없음, 모든 항목 유지`);
		return items;
	})();

	const includeRegexes = include.map((pattern) => new RegExp(pattern));
	const excludeRegexes = exclude.map((pattern) => new RegExp(pattern));

	const filtered = items.filter((item) => {
		const filePath = item.file;
		let allowed = includeRegexes.length === 0 ? true : includeRegexes.some((regex) => regex.test(filePath));
		return allowed && !(excludeRegexes.length > 0 && excludeRegexes.some((regex) => regex.test(filePath)));
	});

	fnLogger(`info`, `필터링 결과: ${items.length} -> ${filtered.length}`);
	return filtered;
};

// 5. 파일별 그룹화 ----------------------------------------------------------------------------
const fnGroupByFile = (items=[]) => {
	fnLogger(`step`, `5`, `파일별 그룹화 시작`);

	const fileMap = new Map();
	for (const item of items) {
		!fileMap.has(item.file) && fileMap.set(item.file, []);
		fileMap.get(item.file).push(item);
	}

	fnLogger(`info`, `그룹화된 파일 수: ${fileMap.size}`);
	return fileMap;
};

// 파일 경로 유틸리티 -------------------------------------------------------------------------
const fnToProjectAbsolute = (filePath=``) => {
	const normalized = filePath.replace(/\//g, path.sep);
	(/^[a-zA-Z]:[\\/]/.test(normalized) || /^\\\\/.test(normalized)) && (() => {
		return normalized;
	})();
	const trimmed = normalized.replace(/^[\\/]+/, ``);
	return path.resolve(process.cwd(), trimmed);
};

// 안전한 백업 생성 ---------------------------------------------------------------------------
const fnSafeBackup = (filePath=``) => {
	const backupPath = filePath + `.bak`;

	try {
		!fs.existsSync(filePath) && (() => {
			return false;
		})();
		!fs.existsSync(backupPath) && fs.copyFileSync(filePath, backupPath);
		fnLogger(`info`, `백업 생성: ${backupPath}`);
		return true;
	}
	catch (error) {
		fnLogger(`warn`, `백업 실패: ${error instanceof Error ? error.message : String(error)}`);
		return false;
	}
};

// Export 제거 함수 ----------------------------------------------------------------------------
const fnRemoveNamesInExportDeclarations = (sourceFile, targetNames) => {
	const exportDeclarations = sourceFile.getExportDeclarations();

	for (const exportDecl of exportDeclarations) {
		const specifiers = exportDecl.getNamedExports();
		specifiers.length === 0 && (() => {
			continue;
		})();

		const toRemove = [];
		for (const spec of specifiers) {
			const localName = spec.getNameNode().getText();
			const aliasNode = spec.getAliasNode();
			const exportedName = aliasNode ? aliasNode.getText() : localName;
			(targetNames.has(exportedName) || targetNames.has(localName)) && (() => {
				toRemove.push(spec);
			})();
		}

		toRemove.forEach((spec) => spec.remove());
		(exportDecl.getNamedExports().length === 0 && !(exportDecl.isNamespaceExport && exportDecl.isNamespaceExport())) && (() => {
			exportDecl.remove();
		})();
	}
};

// 로컬 선언 제거 함수 ----------------------------------------------------------------------------
const fnRemoveLocalDeclarationsByNames = (sourceFile, targetNames) => {
	const variableStatements = sourceFile.getVariableStatements().filter((stmt) => stmt.hasExportKeyword());

	for (const varStmt of variableStatements) {
		const declarations = varStmt.getDeclarations();
		const toRemove = declarations.filter((decl) => targetNames.has(decl.getName()));
		toRemove.length === 0 && (() => {
			continue;
		})();

		toRemove.length === declarations.length ? (
			varStmt.remove()
		) : (
			toRemove.forEach((decl) => decl.remove())
		);
	}

	const removeExportedNodes = (nodes) => {
		for (const node of nodes) {
			const nodeName = node.getName ? node.getName() : null;
			nodeName && targetNames.has(nodeName) && node.hasExportKeyword && node.hasExportKeyword() && node.remove();
		}
	};

	removeExportedNodes(sourceFile.getFunctions());
	removeExportedNodes(sourceFile.getClasses());
	removeExportedNodes(sourceFile.getEnums());
	removeExportedNodes(sourceFile.getInterfaces());
	removeExportedNodes(sourceFile.getTypeAliases());
};

// 기본 내보내기 제거 함수 ----------------------------------------------------------------------
const fnRemoveDefaultExport = (sourceFile) => {
	const assignments = sourceFile.getExportAssignments();
	const defaultAssignment = assignments.find((assignment) => assignment.isExportEquals() === false);

	defaultAssignment && (() => {
		defaultAssignment.remove();
		return true;
	})();

	const declarations = [
		...sourceFile.getFunctions(),
		...sourceFile.getClasses()
	];

	for (const decl of declarations) {
		decl.hasExportKeyword && decl.hasExportKeyword() && (() => {
			const modifiers = decl.getModifiers().map((mod) => mod.getText());
			modifiers.includes(`default`) && (() => {
				decl.remove();
				return true;
			})();
		})();
	}

	return false;
};

// 6. 파일 처리 -------------------------------------------------------------------------------
const fnProcessFile = (project, filePath=``, names, options={}) => {
	const absolutePath = fnToProjectAbsolute(filePath);
	fnLogger(`info`, `파일 처리 중: ${filePath}`);

	/\.d\.ts$/.test(absolutePath) && (() => {
		return {
			file: filePath,
			removed: [],
			skipped: true,
			reason: `declaration-file`
		};
	})();

	const sourceFile = project.getSourceFile(absolutePath) || project.addSourceFileAtPathIfExists(absolutePath);
	!sourceFile && (() => {
		return {
			file: filePath,
			removed: [],
			skipped: true,
			reason: `file-not-found`
		};
	})();

	const removedSet = new Set();
	fnRemoveNamesInExportDeclarations(sourceFile, names);
	fnRemoveLocalDeclarationsByNames(sourceFile, names);
	names.has(`default`) && fnRemoveDefaultExport(sourceFile) && removedSet.add(`default`);
	names.forEach((name) => removedSet.add(name));

	(removedSet.size > 0 && options.apply) && (() => {
		options.backup && fnSafeBackup(absolutePath);
		sourceFile.saveSync();
		fnLogger(`success`, `파일 저장 완료: ${filePath}`);
	})();

	return {
		file: filePath,
		removed: Array.from(removedSet),
		skipped: false
	};
};

// 실행 -----------------------------------------------------------------------------------------
(() => {
	fnLogger(`info`, `ts-prune autofix 시작`);

	const args = fnParseArgs(process.argv);
	const rawOutput = fnRunTsPrune(args);
	const parsedItems = fnParseTsPruneOutput(rawOutput);
	const filteredItems = fnFilterByPath(parsedItems, args.include, args.exclude);
	const groupedByFile = fnGroupByFile(filteredItems);

	fnLogger(`step`, `6`, `TypeScript 프로젝트 로드`);
	const project = new Project({
		tsConfigFilePath: path.resolve(process.cwd(), args.project),
		skipAddingFilesFromTsConfig: false
	});

	fnLogger(`step`, `7`, `파일 처리 시작`);
	const results = [];
	for (const [file, items] of groupedByFile.entries()) {
		const nameSet = new Set(items.map((item) => item.name));
		const result = fnProcessFile(project, file, nameSet, {
			apply: args.apply,
			backup: args.backup
		});
		results.push(result);
	}

	const summary = {
		project: args.project,
		apply: args.apply,
		totalFiles: groupedByFile.size,
		modifiedFiles: results.filter((result) => result.removed.length > 0).length,
		skippedFiles: results.filter((result) => result.skipped).map((result) => ({
			file: result.file,
			reason: result.reason
		})),
		details: results
	};

	args.report && (() => {
		fnLogger(`info`, `리포트 저장: ${args.report}`);
		fs.writeFileSync(args.report, JSON.stringify(summary, null, 2), `utf8`);
	})();

	fnLogger(`success`, `ts-prune autofix 완료`);
	fnLogger(`info`, `프로젝트: ${summary.project}`);
	fnLogger(`info`, `적용 모드: ${summary.apply}`);
	fnLogger(`info`, `후보 파일 수: ${summary.totalFiles}`);
	fnLogger(`info`, `수정된 파일 수: ${summary.modifiedFiles}`);

	summary.skippedFiles.length > 0 && (() => {
		fnLogger(`warn`, `건너뛴 파일들:`);
		summary.skippedFiles.forEach((skipped) => fnLogger(`warn`, `  - ${skipped.file} (${skipped.reason})`));
	})();
})();