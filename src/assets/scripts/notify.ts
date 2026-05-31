/**
 * @file notify.ts
 * @since 2025-11-21
 */

import { vscode } from "@exportLibs";

const MAIN = `Simple-Bookmark`;
const AT_CLS_MS = 1000;
const LOG_CONFIG = {
  "debug": {
    "str": `[D]`,
  },
  "info": {
    "str": `[I]`,
  },
  "hint": {
    "str": `[H]`,
  },
  "warn": {
    "str": `[W]`,
  },
  "error": {
    "str": `[E]`,
  },
} as const;

type NotifyType = keyof typeof LOG_CONFIG;

// 1. Show progress ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
const showProgress = async (text: string): Promise<void> => {
  await vscode.window.withProgress(
    {
      "location": vscode.ProgressLocation.Notification,
      "title": text,
      "cancellable": false,
    },
    async () => {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, AT_CLS_MS);
      });
    },
  );
};

// 2. Format notify ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
const formatNotify = (type: NotifyType, value: string): string => `[${MAIN}] ${LOG_CONFIG[type].str} ${value}`;

// 3. Notify ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export const notify = async (type: NotifyType, value: string): Promise<void> => {
  await showProgress(formatNotify(type, value));
};
