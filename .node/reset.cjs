// reset.cjs

const { spawnSync } = require("child_process");
const { rmSync, existsSync } = require("fs");
const { join } = require("path");

// 로깅 함수 -----------------------------------------------------------------------------------
const fnLogger = (type=``, message=``) => {
	const fnFormat = (text=``) => text.trim().replace(/^\s+/gm, ``);
	const line = `----------------------------------------`;
	const colors = {
		line: `\x1b[38;5;214m`,
		info: `\x1b[36m`,
		success: `\x1b[32m`,
		warn: `\x1b[33m`,
		error: `\x1b[31m`,
		reset: `\x1b[0m`
	};
	const separator = `${colors.line}${line}${colors.reset}`;

	type === `info` && console.log(fnFormat(`
		${separator}
		${colors.info}[INFO]${colors.reset} - ${message}
	`));
	type === `success` && console.log(fnFormat(`
		${separator}
		${colors.success}[SUCCESS]${colors.reset} - ${message}
	`));
	type === `warn` && console.log(fnFormat(`
		${separator}
		${colors.warn}[WARN]${colors.reset} - ${message}
	`));
	type === `error` && console.log(fnFormat(`
		${separator}
		${colors.error}[ERROR]${colors.reset} - ${message}
	`));
};

// 1. 시스템 준비 (대기) ---------------------------------------------------------------------
const fnPrepareSystem = () => {
	fnLogger(`info`, `시스템 준비 시작`);
	fnLogger(`info`, `대기: 200ms 시작`);

	const start = Date.now();
	while (Date.now() - start < 200) {}

	fnLogger(`success`, `대기 완료`);
};

// 2. 파일 정리 ------------------------------------------------------------------------------
const fnCleanup = () => {
	fnLogger(`info`, `파일 삭제 시작 (총 5개)`);

	[
		`node_modules`,
		`package-lock.json`,
		`bun.lock`,
		`yarn.lock`,
		`pnpm-lock.yaml`
	].forEach((target, index) => {
		const targetPath = join(process.cwd(), target);
		fnLogger(`info`, `${index + 1}/5: ${target} 확인 중`);

		try {
			existsSync(targetPath) ? (() => {
				fnLogger(`info`, `삭제: ${target}`);
				rmSync(targetPath, { recursive: true, force: true });
				fnLogger(`success`, `${target} 삭제 완료`);
			})() : fnLogger(`info`, `${target} 존재하지 않음 - 건너뜀`);
		}
		catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			fnLogger(`error`, `${target} 삭제 실패: ${msg}`);
			throw e;
		}
	});

	fnLogger(`success`, `파일 삭제 완료`);
};

// 3. 의존성 설치 ------------------------------------------------------------------------------
const fnInstallDependencies = (cliTool=``) => {
	fnLogger(`info`, `의존성 설치 시작 (옵션: ${cliTool || `auto-detect`})`);

	const fnRunCommand = (cmd=``, args=[]) => {
		fnLogger(`info`, `실행: ${cmd} ${args.join(` `)}`);

		const result = spawnSync(cmd, args, {
			stdio: `inherit`,
			shell: true
		});

		result.error && (() => {
			fnLogger(`error`, `${cmd} 실행 오류: ${result.error.message}`);
			throw new Error(`${cmd} failed: ${result.error.message}`);
		})();

		result.status !== 0 && (() => {
			fnLogger(`error`, `${cmd} 종료 코드: ${result.status}`);
			throw new Error(`${cmd} exited with code ${result.status}`);
		})();

		fnLogger(`success`, `${cmd} 실행 성공`);
	};

	const fnHasCommand = (cmd=``) => {
		try {
			const r = spawnSync(cmd, [`--version`], {
				stdio: `ignore`,
				shell: true
			});
			return r.status === 0;
		}
		catch {
			return false;
		}
	};

	const fnInstallWithPnpm = () => {
		fnHasCommand(`pnpm`) ? (() => {
			fnRunCommand(`pnpm`, [`install`]);
		})() : (() => {
			fnLogger(`info`, `PNPM 미설치 - 설치 시도`);

			fnHasCommand(`corepack`) ? (() => {
				try {
					fnLogger(`info`, `PNPM 준비: corepack enable`);
					fnRunCommand(`corepack`, [`enable`]);
					fnLogger(`info`, `PNPM 준비: corepack prepare pnpm@latest --activate`);
					fnRunCommand(`corepack`, [`prepare`, `pnpm@latest`, `--activate`]);

					fnHasCommand(`pnpm`) && fnRunCommand(`pnpm`, [`install`]);
				}
				catch {
					fnLogger(`warn`, `corepack으로 pnpm 설치 실패`);
					fnHasCommand(`npm`) ? (() => {
						try {
							fnLogger(`info`, `PNPM 설치 시도: npm install -g pnpm`);
							fnRunCommand(`npm`, [`install`, `-g`, `pnpm`]);
							fnHasCommand(`pnpm`) && fnRunCommand(`pnpm`, [`install`]);
						}
						catch {
							fnLogger(`warn`, `npm으로 pnpm 설치 실패`);
							fnHasCommand(`npx`) ? (() => {
								fnLogger(`info`, `npx를 통해 pnpm 실행`);
								fnRunCommand(`npx`, [`-y`, `pnpm`, `install`]);
							})() : (() => {
								throw new Error(`pnpm 사용 불가: 모든 설치 방법 실패`);
							})();
						}
					})() : fnHasCommand(`npx`) ? (() => {
						fnLogger(`info`, `npx를 통해 pnpm 실행`);
						fnRunCommand(`npx`, [`-y`, `pnpm`, `install`]);
					})() : (() => {
						throw new Error(`pnpm 사용 불가: corepack/npm/npx 모두 실행 불가`);
					})();
				}
			})() : fnHasCommand(`npm`) ? (() => {
				try {
					fnLogger(`info`, `PNPM 설치 시도: npm install -g pnpm`);
					fnRunCommand(`npm`, [`install`, `-g`, `pnpm`]);
					fnHasCommand(`pnpm`) && fnRunCommand(`pnpm`, [`install`]);
				}
				catch {
					fnLogger(`warn`, `npm으로 pnpm 설치 실패`);
					fnHasCommand(`npx`) ? (() => {
						fnLogger(`info`, `npx를 통해 pnpm 실행`);
						fnRunCommand(`npx`, [`-y`, `pnpm`, `install`]);
					})() : (() => {
						throw new Error(`pnpm 사용 불가: npm/npx 모두 실행 불가`);
					})();
				}
			})() : fnHasCommand(`npx`) ? (() => {
				fnLogger(`info`, `npx를 통해 pnpm 실행`);
				fnRunCommand(`npx`, [`-y`, `pnpm`, `install`]);
			})() : (() => {
				throw new Error(`pnpm 사용 불가: corepack/npm/npx 모두 실행 불가`);
			})();
		})();
	};

	cliTool === `--bun` ? (() => {
		!fnHasCommand(`bun`) && (() => {
			throw new Error(`bun 미설치 또는 실행 불가`);
		})();
		fnRunCommand(`bun`, [`install`]);
	})() : cliTool === `--pnpm` ? (() => {
		fnInstallWithPnpm();
	})() : cliTool === `--yarn` ? (() => {
		!fnHasCommand(`yarn`) && (() => {
			throw new Error(`yarn 미설치 또는 실행 불가`);
		})();
		fnRunCommand(`yarn`, [`install`]);
	})() : cliTool === `--npm` ? (() => {
		fnRunCommand(`npm`, [`install`]);
	})() : (() => {
		fnLogger(`info`, `자동 감지: 사용 가능한 패키지 매니저 확인`);

		fnHasCommand(`bun`) ? (() => {
			fnLogger(`info`, `자동 선택: Bun`);
			fnRunCommand(`bun`, [`install`]);
		})() : fnHasCommand(`pnpm`) ? (() => {
			fnLogger(`info`, `자동 선택: PNPM`);
			fnRunCommand(`pnpm`, [`install`]);
		})() : fnHasCommand(`yarn`) ? (() => {
			fnLogger(`info`, `자동 선택: Yarn`);
			fnRunCommand(`yarn`, [`install`]);
		})() : (() => {
			fnLogger(`info`, `자동 선택: NPM`);
			fnRunCommand(`npm`, [`install`]);
		})();
	})();

	fnLogger(`success`, `의존성 설치 완료`);
};

// 실행 ---------------------------------------------------------------------------------------
(() => {
	const arg = process.argv[2] || ``;
	fnLogger(`info`, `스크립트 실행: reset.cjs (인자: ${arg || `none`})`);
	fnLogger(`info`, `프로젝트 리셋 시작 (작업 디렉토리: ${process.cwd()})`);

	try {
		fnPrepareSystem();
		fnCleanup();
		fnInstallDependencies(arg);
		fnLogger(`success`, `프로젝트 리셋 완료`);
	}
	catch (e) {
		fnLogger(`error`, `프로젝트 리셋 실패: ${e.message}`);
		process.exit(1);
	}
})();