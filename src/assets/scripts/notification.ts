// assets/scripts/notification.ts

import { vscode } from "@exportLibs";

// 콘솔 로깅 출력 ----------------------------------------------------------------------
export const fnLogging = (
	type:
	`debug` |
	`info` |
	`warn` |
	`error`,
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
): void => {
	type === `debug` && (() => {
		console.debug(
			`[simple-bookmark] [${key}] ${value}`
		);
	})();
	type === `info` && (() => {
		console.info(
			`[simple-bookmark] [${key}] ${value}`
		);
	})();
	type === `warn` && (() => {
		console.warn(
			`[simple-bookmark] [${key}] ${value}`
		);
	})();
	type === `error` && (() => {
		console.error(
			`[simple-bookmark] [${key}] ${value}`
		);
		throw new Error(`[simple-bookmark] [${key}] ${value}`);
	})();
};

// VS Code 알림 센터 메시지 출력 -------------------------------------------------------
export const fnNotification = (
	type:
	`debug` |
	`info` |
	`warn` |
	`error`,
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
): void => {
	type === `debug` && (() => {
		vscode.window.showInformationMessage(
			`[simple-bookmark] [${key}] ${value}`, {
			modal: false
		});
	})();
	type === `info` && (() => {
		setTimeout(() => {
			vscode.window.showInformationMessage(
				`[simple-bookmark] [${key}] ${value}`, {
				modal: false
			});
		}, 2000);
	})();
	type === `warn` && (() => {
		setTimeout(() => {
			vscode.window.showWarningMessage(
				`[simple-bookmark] [${key}] ${value}`, {
				modal: false
			});
		}, 2000);
	})();
	type === `error` && (() => {
		setTimeout(() => {
			vscode.window.showErrorMessage(
				`[simple-bookmark] [${key}] ${value}`, {
				modal: false
			});
		}, 2000);
	})();
};