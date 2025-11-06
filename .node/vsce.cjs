// vsce.cjs

const { spawnSync } = require(`child_process`);
const fs = require(`fs`);
const path = require(`path`);
const process = require(`process`);

// 상수 정의 ---------------------------------------------------------------------------------
const PLATFORM_WIN32 = process.platform === `win32`;
const PACKAGE_JSON_PATH = path.join(process.cwd(), `package.json`);
const COMMANDS = {
	pnpm: PLATFORM_WIN32 ? `pnpm.cmd` : `pnpm`,
	tsc: PLATFORM_WIN32 ? `tsc.cmd` : `tsc`,
	tscAlias: PLATFORM_WIN32 ? `tsc-alias.cmd` : `tsc-alias`,
	esbuild: PLATFORM_WIN32 ? `esbuild.cmd` : `esbuild`,
	vsce: PLATFORM_WIN32 ? `vsce.cmd` : `vsce`
};

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

// 버전 증가 함수 ------------------------------------------------------------------------------
const fnIncrementVersion = () => {
	fnLogger(`step`, `0. 버전 자동 증가`);

	!fs.existsSync(PACKAGE_JSON_PATH) && (() => {
		fnLogger(`error`, `package.json 파일을 찾을 수 없습니다: ${PACKAGE_JSON_PATH}`);
		process.exit(1);
	})();

	const packageJson = JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, `utf8`));
	const currentVersion = packageJson.version;

	!currentVersion && (() => {
		fnLogger(`error`, `package.json에 version 필드가 없습니다`);
		process.exit(1);
	})();

	const versionParts = currentVersion.split(`.`);
	versionParts.length !== 3 && (() => {
		fnLogger(`error`, `올바르지 않은 버전 형식입니다: ${currentVersion}`);
		process.exit(1);
	})();

	const [major, minor, patch] = versionParts.map(Number);
	const newVersion = `${major}.${minor}.${patch + 1}`;

	packageJson.version = newVersion;
	fs.writeFileSync(PACKAGE_JSON_PATH, JSON.stringify(packageJson, null, 2) + `\n`, `utf8`);

	fnLogger(`success`, `버전 업데이트: ${currentVersion} → ${newVersion}`);
	return newVersion;
};

// 명령 실행 함수 ------------------------------------------------------------------------------
const fnRunCommand = (cmd=``, args=[], stepName=``) => {
	fnLogger(`step`, stepName);
	fnLogger(`info`, `실행: ${cmd} ${args.join(` `)}`);

	const result = spawnSync(cmd, args, {
		stdio: `inherit`,
		shell: true,
		cwd: process.cwd()
	});

	result.status !== 0 && (() => {
		fnLogger(`error`, `${stepName} 실패 (exit code: ${result.status})`);
		process.exit(1);
	})();

	fnLogger(`success`, `${stepName} 완료`);
	return result;
};

// 메인 실행 함수 ------------------------------------------------------------------------------
const fnVsce = () => {
	fnLogger(`info`, `VSCE 패키지 빌드 시작`);

	fnIncrementVersion();

	fnRunCommand(
		COMMANDS.pnpm,
		[`add`, `-D`, `esbuild`],
		`1. esbuild 의존성 설치`
	);

	fnRunCommand(
		COMMANDS.tsc,
		[`-p`, `.`],
		`2. TypeScript 컴파일`
	);

	fnRunCommand(
		COMMANDS.tscAlias,
		[`-p`, `tsconfig.json`, `-f`],
		`3. TypeScript 경로 별칭 처리`
	);

	fnRunCommand(
		COMMANDS.esbuild,
		[
			`src/extension.ts`,
			`--bundle`,
			`--platform=node`,
			`--target=node18`,
			`--outfile=out/extension.js`,
			`--external:vscode`,
			`--minify`
		],
		`4. esbuild 번들링`
	);

	fnRunCommand(
		COMMANDS.vsce,
		[`package`, `--no-dependencies`],
		`5. VSCE 패키지 생성`
	);

	fnLogger(`success`, `VSCE 패키지 빌드 완료`);
};

// 실행 ---------------------------------------------------------------------------------------
(() => {
	fnVsce();
})();
