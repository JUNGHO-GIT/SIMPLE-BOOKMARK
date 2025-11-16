// assets/scripts/logger.ts

import { vscode } from "@exportLibs";

// -----------------------------------------------------------------------------------------
let logLevelMap = { "off": 0, "debug": 1, "info": 2, "warn": 3, "error": 4 };
let outputChannel: vscode.OutputChannel | null = null;

// -----------------------------------------------------------------------------------------
const getLogLevel = (): number => {
	const config = vscode.workspace.getConfiguration(`Simple-Bookmark`);
	const level = config.get<string>(`logLevel`, `info`);
	return logLevelMap[level as keyof typeof logLevelMap] || 2;
};

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
	const currentLevel = getLogLevel();
	const messageLevel = logLevelMap[type];

	currentLevel === 0 || messageLevel < currentLevel ? (
		void 0
	) : (
		initLogger(),
		type === `debug` && console.debug(`[Simple-Bookmark] [${key}] ${value}`),
		type === `info` && console.info(`[Simple-Bookmark] [${key}] ${value}`),
		type === `warn` && console.warn(`[Simple-Bookmark] [${key}] ${value}`),
		type === `error` && console.error(`[Simple-Bookmark] [${key}] ${value}`),
		outputChannel?.appendLine(`[${type.toUpperCase()}] [${key}] ${value}`)
	);
};