// reset.cjs

const { spawnSync } = require("child_process");
const { rmSync, existsSync } = require("fs");
const { join } = require("path");

// 상수 정의 ------------------------------------------------------------------------------------
const SHOULD_KILL_NODE = process.env.RESET_KILL_NODE === `1`;
const PLATFORM_WIN32 = `win32`;
const SLEEP_MILLISECONDS = 200;
const DELETE_TARGETS = [
	`node_modules`,
	`package-lock.json`,
	`bun.lock`,
	`yarn.lock`,
	`pnpm-lock.yaml`
];
const COMMANDS = {
	POWERSHELL_EXE: `powershell.exe`,
	POWERSHELL: `powershell`,
	PWSH: `pwsh`,
	SH: `sh`,
	BUN: `bun`,
	NPM: `npm`,
	PNPM: `pnpm`,
	YARN: `yarn`,
	COREPACK: `corepack`,
	NPX: `npx`
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
	type === `progress` && (() => {
		console.log(`[PROGRESS] ${args[0]}/${args[1]} - ${args[2]}`);
	})();
};

// 1. 시스템 준비 (프로세스 정리 + 대기) -------------------------------------------------------------
const fnPrepareSystem = () => {
	fnLogger(`step`, `시스템 준비`, `시작`);

	(() => {
		(process.platform !== PLATFORM_WIN32 || !SHOULD_KILL_NODE) && (() => {
			return;
		})();

		const ps = (
			spawnSync(COMMANDS.POWERSHELL_EXE, [`-NoProfile`, `-Command`, `$PSVersionTable`], { stdio: `ignore`, shell: false }).status === 0
		) ? COMMANDS.POWERSHELL_EXE : (
			spawnSync(COMMANDS.POWERSHELL, [`-NoProfile`, `-Command`, `$PSVersionTable`], { stdio: `ignore`, shell: false }).status === 0
		) ? COMMANDS.POWERSHELL : (
			spawnSync(COMMANDS.PWSH, [`-NoLogo`, `-NoProfile`, `-Command`, `$PSVersionTable`], { stdio: `ignore`, shell: false }).status === 0
		) ? COMMANDS.PWSH : ``;

		!ps && (() => {
			return;
		})();

		const selfPid = process.pid;
		const script = (`
			$self=${selfPid};
			$p=Get-Process node -ErrorAction SilentlyContinue;
			if ($p) {
				$p | Where-Object { $_.Id -ne $self } |Stop-Process -Force -ErrorAction SilentlyContinue
			}
		`).trim();

		fnLogger(`step`, `프로세스 정리`, `다른 Node 프로세스 종료 시도 (self PID=${selfPid})`);

		try {
			spawnSync(ps, [`-NoProfile`, `-Command`, script], { stdio: `ignore`, shell: false });
			fnLogger(`success`, `프로세스 정리 완료`);
		}
		catch {
			fnLogger(`warn`, `프로세스 정리 실패, 계속 진행`);
		}
	})();

	fnLogger(`step`, `대기`, `${SLEEP_MILLISECONDS}ms 시작`);

	(() => {
		process.platform === PLATFORM_WIN32 ? (() => {
			const ps = (
				spawnSync(COMMANDS.POWERSHELL_EXE, [`-NoProfile`, `-Command`, `$PSVersionTable`], { stdio: `ignore`, shell: false }).status === 0
			) ? COMMANDS.POWERSHELL_EXE : (
				spawnSync(COMMANDS.POWERSHELL, [`-NoProfile`, `-Command`, `$PSVersionTable`], { stdio: `ignore`, shell: false }).status === 0
			) ? COMMANDS.POWERSHELL : (
				spawnSync(COMMANDS.PWSH, [`-NoLogo`, `-NoProfile`, `-Command`, `$PSVersionTable`], { stdio: `ignore`, shell: false }).status === 0
			) ? COMMANDS.PWSH : null;

			ps ? (() => {
				try {
					spawnSync(ps, [`-NoProfile`, `-Command`, `Start-Sleep -Milliseconds ${SLEEP_MILLISECONDS}`], {
						stdio: `inherit`,
						shell: false
					});
					fnLogger(`success`, `대기 완료`);
				}
				catch {}
			})() : (() => {
				const start = Date.now();
				while (Date.now() - start < SLEEP_MILLISECONDS) {}
				fnLogger(`success`, `대기 완료 (fallback)`);
			})();
		})() : (() => {
			try {
				spawnSync(COMMANDS.SH, [`-lc`, `sleep ${SLEEP_MILLISECONDS / 1000}`], {
					stdio: `inherit`,
					shell: false
				});
				fnLogger(`success`, `대기 완료`);
			}
			catch {
				const start = Date.now();
				while (Date.now() - start < SLEEP_MILLISECONDS) {}
				fnLogger(`success`, `대기 완료 (fallback)`);
			}
		})();
	})();
};

// 2. 파일 정리 ------------------------------------------------------------------------------
const fnCleanup = () => {
	fnLogger(`step`, `파일 삭제`, `시작 (총 ${DELETE_TARGETS.length}개)`);

	DELETE_TARGETS.forEach((target, index) => {
		(() => {
			const targetPath = join(process.cwd(), target);
			fnLogger(`progress`, index + 1, DELETE_TARGETS.length, target);

			try {
				existsSync(targetPath) ? (() => {
					fnLogger(`step`, `삭제`, `${target} 존재함 - 삭제 시작`);
					rmSync(targetPath, { recursive: true, force: true });
					fnLogger(`success`, `${target} 삭제 완료`);
				})() : (() => {
					fnLogger(`info`, `${target} 존재하지 않음 - 건너뜀`);
				})();
			}
			catch (e) {
				const msg = e instanceof Error ? e.message : String(e);
				fnLogger(`error`, `${target} 삭제 실패: ${msg}`);
				throw e;
			}
		})();
	});

	fnLogger(`success`, `파일 삭제 완료`);
};

// 3. 의존성 설치 ------------------------------------------------------------------------------
const fnInstallDependencies = (cliTool=``) => {
	fnLogger(`step`, `의존성 설치`, `시작 (옵션: ${cliTool || `auto-detect`})`);

	const fnRunCommand = (cmd=``, args=[]) => {
		(() => {
			fnLogger(`step`, `실행`, `${cmd} ${args.join(` `)}`);
			const result = spawnSync(cmd, args, {
				stdio: `inherit`,
				shell: process.platform === PLATFORM_WIN32
			});

			result.error && (() => {
				result.error.code === `ENOENT` ? (() => {
					fnLogger(`error`, `${cmd} 명령을 찾을 수 없음`);
					throw new Error(`Command not found: ${cmd}`);
				})() : (() => {
					fnLogger(`error`, `${cmd} 실행 오류: ${result.error.message}`);
					throw new Error(`${cmd} failed: ${result.error.message}`);
				})();
			})();

			typeof result.status === `number` && result.status !== 0 && (() => {
				fnLogger(`error`, `${cmd} 종료 코드: ${result.status}`);
				throw new Error(`${cmd} exited with code ${result.status}`);
			})();

			fnLogger(`success`, `${cmd} 실행 성공`);
		})();
	};

	const fnHasCommand = (cmd=``) => {
		try {
			const r = spawnSync(cmd, [`--version`], {
				stdio: `ignore`,
				shell: process.platform === PLATFORM_WIN32
			});
			return typeof r.status === `number` && r.status === 0;
		}
		catch {
			return false;
		}
	};

	const fnInstallWithPnpm = () => {
		(() => {
			fnHasCommand(COMMANDS.PNPM) ? (() => {
				fnRunCommand(COMMANDS.PNPM, [`install`]);
			})() : fnHasCommand(COMMANDS.COREPACK) ? (() => {
				try {
					fnLogger(`step`, `PNPM 준비`, `corepack enable`);
					fnRunCommand(COMMANDS.COREPACK, [`enable`]);
				}
				catch {
					fnLogger(`warn`, `corepack enable 실패`);
				}
				try {
					fnLogger(`step`, `PNPM 준비`, `corepack prepare pnpm@latest --activate`);
					fnRunCommand(COMMANDS.COREPACK, [`prepare`, `pnpm@latest`, `--activate`]);
					fnHasCommand(COMMANDS.PNPM) && (() => {
						fnRunCommand(COMMANDS.PNPM, [`install`]);
					})();
				}
				catch {
					fnLogger(`warn`, `corepack prepare 실패`);
				}
			})() : fnHasCommand(COMMANDS.NPX) ? (() => {
				fnRunCommand(COMMANDS.NPX, [`-y`, `pnpm`, `install`]);
			})() : (() => {
				throw new Error(`pnpm 사용 불가: pnpm/corepack/npx 모두 실행 불가`);
			})();
		})();
	};

	(() => {
		switch (cliTool) {
			case `--bun`:
				!fnHasCommand(COMMANDS.BUN) && (() => {
					throw new Error(`${COMMANDS.BUN} 미설치 또는 실행 불가`);
				})();
				fnRunCommand(COMMANDS.BUN, [`install`]);
				break;

			case `--pnpm`:
				fnInstallWithPnpm();
				break;

			case `--yarn`:
				!fnHasCommand(COMMANDS.YARN) && (() => {
					throw new Error(`${COMMANDS.YARN} 미설치 또는 실행 불가`);
				})();
				fnRunCommand(COMMANDS.YARN, [`install`]);
				break;

			case `--npm`:
				fnRunCommand(COMMANDS.NPM, [`install`]);
				break;

			default:
				fnLogger(`step`, `자동 감지`, `사용 가능한 패키지 매니저 확인`);
				fnHasCommand(COMMANDS.BUN) ? (() => {
					fnLogger(`step`, `자동 선택`, `Bun`);
					fnRunCommand(COMMANDS.BUN, [`install`]);
				})() : fnHasCommand(COMMANDS.PNPM) ? (() => {
					fnLogger(`step`, `자동 선택`, `PNPM`);
					fnRunCommand(COMMANDS.PNPM, [`install`]);
				})() : fnHasCommand(COMMANDS.YARN) ? (() => {
					fnLogger(`step`, `자동 선택`, `Yarn`);
					fnRunCommand(COMMANDS.YARN, [`install`]);
				})() : (() => {
					fnLogger(`step`, `자동 선택`, `NPM`);
					fnRunCommand(COMMANDS.NPM, [`install`]);
				})();
				break;
		}
	})();

	fnLogger(`success`, `의존성 설치 완료`);
};

// 메인 리셋 함수 ------------------------------------------------------------------------------
const fnReset = async (cliTool=``) => {
	fnLogger(`step`, `프로젝트 리셋`, `시작 (작업 디렉토리: ${process.cwd()})`);
	fnPrepareSystem();
	fnCleanup();
	fnInstallDependencies(cliTool);
	fnLogger(`success`, `프로젝트 리셋 완료`);
};

// 실행 ---------------------------------------------------------------------------------------
(() => {
	const arg = process.argv[2] || ``;
	fnLogger(`step`, `스크립트 실행`, `reset.cjs (인자: ${arg || `none`})`);
	fnReset(arg).catch((err) => {
		fnLogger(`error`, `reset 실패: ${err && err.message ? err.message : err}`);
		process.exit(1);
	});
})();
