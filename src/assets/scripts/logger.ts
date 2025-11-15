// assets/scripts/logger.ts

import { vscode } from "@exportLibs";

// -----------------------------------------------------------------------------------------
let outputChannel: vscode.OutputChannel | null = null;

// -----------------------------------------------------------------------------------------
export const initLogger = (): void => {
	(!outputChannel) ? (
		outputChannel = vscode.window.createOutputChannel(`Simple-Bookmark`)
	) : (
		void 0
	);
};

// -----------------------------------------------------------------------------------------
export const logger = (
	type:
	`debug` |
	`info` |
	`warn` |
	`error`,
	key: string,
	value: string,
): void => {
	initLogger();

	const message = `[${type.toUpperCase()}] [${key}] ${value}`;

	type === `debug` && console.debug(
		`[Simple-Bookmark] [${key}] ${value}`
	);
	type === `info` && console.info(
		`[Simple-Bookmark] [${key}] ${value}`
	);
	type === `warn` && console.warn(
		`[Simple-Bookmark] [${key}] ${value}`
	);
	type === `error` && console.error(
		`[Simple-Bookmark] [${key}] ${value}`
	);

	outputChannel?.appendLine(message);
};