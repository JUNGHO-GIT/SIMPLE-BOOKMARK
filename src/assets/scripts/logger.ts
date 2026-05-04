/**
 * @file logger.ts
 * @since 2025-11-21
 */

import { vscode } from "@exportLibs";

// ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――-
const MAIN = `Simple-Bookmark`;
const logLevelMap = { off: 0, debug: 1, info: 2, hint: 3, warn: 4, error: 5 } as const;
const logConfig = {
  line: {
    str: `―――――――――――――――――――――――――――――――――――――――--`,
    color: `\u001b[38;2;255;162;0m`,
  },
  title: {
    str: `[${MAIN}]`,
    color: `\u001b[38;2;78;201;176m`,
  },
  debug: {
    str: `[DEBUG]`,
    color: `\u001b[38;5;141m`,
  },
  info: {
    str: `[INFO]`,
    color: `\u001b[38;5;46m`,
  },
  hint: {
    str: `[HINT]`,
    color: `\u001b[38;5;39m`,
  },
  warn: {
    str: `[WARN]`,
    color: `\u001b[38;5;214m`,
  },
  error: {
    str: `[ERROR]`,
    color: `\u001b[38;5;196m`,
  },
  reset: {
    str: ``,
    color: `\u001b[0m`,
  },
} as const;
type LogType = Exclude<keyof typeof logLevelMap, `off`>;
let outputChannel: vscode.OutputChannel | null = null;

// 1-1. 로거 초기화
export const initLogger = (): void => {
  if (!outputChannel) {
  	outputChannel = vscode.window.createOutputChannel(MAIN);
  }
};

// 1-2. 로그 레벨 조회
const getLogLevel = (): number => {
  const config = vscode.workspace.getConfiguration(MAIN);
  const level = config.get<string>(`logLevel`, `info`);
  const rs = logLevelMap[level as keyof typeof logLevelMap] ?? 2;
  return rs;
};

// 1-3. 출력 채널 반영
const appendOutput = (msg: string): void => {
  outputChannel?.appendLine(msg);
};

// 1-4. 로그 문자열 정리
const formatLog = (text=``): string => text.trim().replace(/^\s+/gm, ``);

// 1-5. 로그 출력 여부
const shouldLog = (type: LogType): boolean => {
  const currentLevel = getLogLevel();
  return currentLevel !== logLevelMap.off && currentLevel <= logLevelMap[type];
};

// 1-6. 로그 출력
export const logger = (type: LogType, value: string): void => {
  if (shouldLog(type)) {
    const separator = `${logConfig.reset.color}${logConfig.line.color}${logConfig.line.str}${logConfig.reset.color}`;
    const title = `${logConfig.reset.color}${logConfig.title.color}${logConfig.title.str}${logConfig.reset.color}`;
    const level = `${logConfig.reset.color}${logConfig[type].color}${logConfig[type].str}${logConfig.reset.color}`;
    const logMsg = formatLog(`
  ${separator}
  ${title} ${level}
  ${value}
  `);
    const outputMsg = formatLog(`
  ${logConfig.line.str}
  ${logConfig[type].str} - ${value}
  `);

    type === `debug` && console.debug(logMsg);
    type === `info` && console.info(logMsg);
    type === `hint` && console.log(logMsg);
    type === `warn` && console.warn(logMsg);
    type === `error` && console.error(logMsg);
    appendOutput(outputMsg);
  }
};
