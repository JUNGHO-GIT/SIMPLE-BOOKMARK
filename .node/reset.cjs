// reset.cjs

const { spawnSync } = require("child_process");
const { rmSync, existsSync } = require("fs");
const { join } = require("path");

// 로깅 함수 -----------------------------------------------------------------------------------
const logging = (type=``, message=``) => {
	const format = (text=``) => text.trim().replace(/^\s+/gm, ``);
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

	type === `info` && console.log(format(`
		${separator}
		${colors.info}[INFO]${colors.reset} - ${message}
	`));
	type === `success` && console.log(format(`
		${separator}
		${colors.success}[SUCCESS]${colors.reset} - ${message}
	`));
	type === `warn` && console.log(format(`
		${separator}
		${colors.warn}[WARN]${colors.reset} - ${message}
	`));
	type === `error` && console.log(format(`
		${separator}
		${colors.error}[ERROR]${colors.reset} - ${message}
	`));
};

// 1. 시스템 준비 (대기) ---------------------------------------------------------------------
const prepareSystem = () => {
	logging(`info`, `시스템 준비 시작`);
	logging(`info`, `대기: 200ms 시작`);

	const start = Date.now();
	while (Date.now() - start < 200) {}

	logging(`success`, `대기 완료`);
};

// 2. 파일 정리 ------------------------------------------------------------------------------
const cleanup = () => {
	logging(`info`, `파일 삭제 시작 (총 5개)`);

	[
		`node_modules`,
		`package-lock.json`,
		`bun.lock`,
		`yarn.lock`,
		`pnpm-lock.yaml`
	].forEach((target, index) => {
		const targetPath = join(process.cwd(), target);
		logging(`info`, `${index + 1}/5: ${target} 확인 중`);

		try {
			existsSync(targetPath) ? (() => {
				logging(`info`, `삭제: ${target}`);
				rmSync(targetPath, { recursive: true, force: true });
				logging(`success`, `${target} 삭제 완료`);
			})() : logging(`info`, `${target} 존재하지 않음 - 건너뜀`);
		}
		catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			logging(`error`, `${target} 삭제 실패: ${msg}`);
			throw e;
		}
	});

	logging(`success`, `파일 삭제 완료`);
};

// 3. 의존성 설치 ------------------------------------------------------------------------------
const installDependencies = (cliTool=``) => {
	logging(`info`, `의존성 설치 시작 (옵션: ${cliTool || `auto-detect`})`);

	const runCommand = (cmd=``, args=[]) => {
		logging(`info`, `실행: ${cmd} ${args.join(` `)}`);

		const result = spawnSync(cmd, args, {
			stdio: `inherit`,
			shell: true
		});

		result.error && (() => {
			logging(`error`, `${cmd} 실행 오류: ${result.error.message}`);
			throw new Error(`${cmd} failed: ${result.error.message}`);
		})();

		result.status !== 0 && (() => {
			logging(`error`, `${cmd} 종료 코드: ${result.status}`);
			throw new Error(`${cmd} exited with code ${result.status}`);
		})();

		logging(`success`, `${cmd} 실행 성공`);
	};

	const hasCommand = (cmd=``) => {
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

	const installWithPnpm = () => {
		hasCommand(`pnpm`) ? (() => {
			runCommand(`pnpm`, [`install`]);
		})() : (() => {
			logging(`info`, `PNPM 미설치 - 설치 시도`);

			hasCommand(`corepack`) ? (() => {
				try {
					logging(`info`, `PNPM 준비: corepack enable`);
					runCommand(`corepack`, [`enable`]);
					logging(`info`, `PNPM 준비: corepack prepare pnpm@latest --activate`);
					runCommand(`corepack`, [`prepare`, `pnpm@latest`, `--activate`]);

					hasCommand(`pnpm`) && runCommand(`pnpm`, [`install`]);
				}
				catch {
					logging(`warn`, `corepack으로 pnpm 설치 실패`);
					hasCommand(`npm`) ? (() => {
						try {
							logging(`info`, `PNPM 설치 시도: npm install -g pnpm`);
							runCommand(`npm`, [`install`, `-g`, `pnpm`]);
							hasCommand(`pnpm`) && runCommand(`pnpm`, [`install`]);
						}
						catch {
							logging(`warn`, `npm으로 pnpm 설치 실패`);
							hasCommand(`npx`) ? (() => {
								logging(`info`, `npx를 통해 pnpm 실행`);
								runCommand(`npx`, [`-y`, `pnpm`, `install`]);
							})() : (() => {
								throw new Error(`pnpm 사용 불가: 모든 설치 방법 실패`);
							})();
						}
					})() : hasCommand(`npx`) ? (() => {
						logging(`info`, `npx를 통해 pnpm 실행`);
						runCommand(`npx`, [`-y`, `pnpm`, `install`]);
					})() : (() => {
						throw new Error(`pnpm 사용 불가: corepack/npm/npx 모두 실행 불가`);
					})();
				}
			})() : hasCommand(`npm`) ? (() => {
				try {
					logging(`info`, `PNPM 설치 시도: npm install -g pnpm`);
					runCommand(`npm`, [`install`, `-g`, `pnpm`]);
					hasCommand(`pnpm`) && runCommand(`pnpm`, [`install`]);
				}
				catch {
					logging(`warn`, `npm으로 pnpm 설치 실패`);
					hasCommand(`npx`) ? (() => {
						logging(`info`, `npx를 통해 pnpm 실행`);
						runCommand(`npx`, [`-y`, `pnpm`, `install`]);
					})() : (() => {
						throw new Error(`pnpm 사용 불가: npm/npx 모두 실행 불가`);
					})();
				}
			})() : hasCommand(`npx`) ? (() => {
				logging(`info`, `npx를 통해 pnpm 실행`);
				runCommand(`npx`, [`-y`, `pnpm`, `install`]);
			})() : (() => {
				throw new Error(`pnpm 사용 불가: corepack/npm/npx 모두 실행 불가`);
			})();
		})();
	};

	cliTool === `--bun` ? (() => {
		!hasCommand(`bun`) && (() => {
			throw new Error(`bun 미설치 또는 실행 불가`);
		})();
		runCommand(`bun`, [`install`]);
	})() : cliTool === `--pnpm` ? (() => {
		installWithPnpm();
	})() : cliTool === `--yarn` ? (() => {
		!hasCommand(`yarn`) && (() => {
			throw new Error(`yarn 미설치 또는 실행 불가`);
		})();
		runCommand(`yarn`, [`install`]);
	})() : cliTool === `--npm` ? (() => {
		runCommand(`npm`, [`install`]);
	})() : (() => {
		logging(`info`, `자동 감지: 사용 가능한 패키지 매니저 확인`);

		hasCommand(`bun`) ? (() => {
			logging(`info`, `자동 선택: Bun`);
			runCommand(`bun`, [`install`]);
		})() : hasCommand(`pnpm`) ? (() => {
			logging(`info`, `자동 선택: PNPM`);
			runCommand(`pnpm`, [`install`]);
		})() : hasCommand(`yarn`) ? (() => {
			logging(`info`, `자동 선택: Yarn`);
			runCommand(`yarn`, [`install`]);
		})() : (() => {
			logging(`info`, `자동 선택: NPM`);
			runCommand(`npm`, [`install`]);
		})();
	})();

	logging(`success`, `의존성 설치 완료`);
};

// 실행 ---------------------------------------------------------------------------------------
(() => {
	const arg = process.argv[2] || ``;
	logging(`info`, `스크립트 실행: reset.cjs (인자: ${arg || `none`})`);
	logging(`info`, `프로젝트 리셋 시작 (작업 디렉토리: ${process.cwd()})`);

	try {
		prepareSystem();
		cleanup();
		installDependencies(arg);
		logging(`success`, `프로젝트 리셋 완료`);
	}
	catch (e) {
		logging(`error`, `프로젝트 리셋 실패: ${e.message}`);
		process.exit(1);
	}
})();