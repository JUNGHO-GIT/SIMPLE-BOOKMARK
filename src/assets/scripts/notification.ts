// assets/scripts/notificationUtil.ts

import { vscode } from "@importLibs";

// 콘솔 로깅 출력 ----------------------------------------------------------------------
export const fnLogging = (
	key:
	`activate` |
	`deactivate` |
	`add` |
	`copy` |
	`paste` |
	`remove` |
	`rename` |
	`move` |
	`duplicate` |
	`create` |
	`save` |
	`overwrite` |
	`export` |
	`select` |
	`expand` |
	`collapse`,
	value: string,
	type:
	`debug` |
	`info` |
	`warn` |
	`error`,
): void => {
	const loggers = {
		debug: () => console.debug(
			`[simple-bookmark] [${key}] ${value}`
		),
		info: () => console.info(
			`[simple-bookmark] [${key}] ${value}`
		),
		warn: () => console.warn(
			`[simple-bookmark] [${key}] ${value}`
		),
		error: () => {
			console.error(
				`[simple-bookmark] [${key}] ${value}`
			);
			throw new Error(`[simple-bookmark] [${key}] ${value}`);
		},
	};
	loggers[type]();
};

// VS Code 알림 센터 메시지 출력 -------------------------------------------------------
export const fnNotification = (
	key:
	`activate` |
	`deactivate` |
	`add` |
	`copy` |
	`paste` |
	`remove` |
	`rename` |
	`move` |
	`duplicate` |
	`create` |
	`save` |
	`overwrite` |
	`export` |
	`select` |
	`expand` |
	`collapse`,
	value: string,
	type:
	`debug` |
	`info` |
	`warn` |
	`error`,
): void => {
	const notifications = {
		debug: () => vscode.window.showInformationMessage(
			`[simple-bookmark] [${key}] ${value}`, {
			modal: false
		}),
		info: () => setTimeout(() => {
			vscode.window.showInformationMessage(`[simple-bookmark] [${key}] ${value}`, {
				modal: false
			});
		}, 2000),
		warn: () => setTimeout(() => {
			vscode.window.showWarningMessage(`[simple-bookmark] [${key}] ${value}`, {
				modal: false
			});
		}, 2000),
		error: () => setTimeout(() => {
			vscode.window.showErrorMessage(`[simple-bookmark] [${key}] ${value}`, {
				modal: false
			});
		}, 2000)
	};
	notifications[type]();
};