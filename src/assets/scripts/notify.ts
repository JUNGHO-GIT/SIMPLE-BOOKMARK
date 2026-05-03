/**
 * @file notify.ts
 * @since 2025-11-21
 */

import { vscode } from "@exportLibs";

// ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――-
const MAIN = `Simple-Bookmark`;
const AUTO_CLOSE_MS = 1000;

// 1-1. 진행 알림 표시
const showProgress = async (text: string): Promise<void> => {
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: text,
      cancellable: false,
    },
    async () => {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, AUTO_CLOSE_MS);
      });
    },
  );
};

// 1-2. 알림 출력
export const notify = async (type: `debug` | `info` | `hint` | `warn` | `error`, value: string): Promise<void> => {
  const config = {
    title: {
      str: `[${MAIN}]`,
    },
    debug: {
      str: `[DEBUG]`,
    },
    info: {
      str: `[INFO]`,
    },
    hint: {
      str: `[HINT]`,
    },
    warn: {
      str: `[WARN]`,
    },
    error: {
      str: `[ERROR]`,
    },
  };
  const text = `${config.title.str} ${config[type].str} ${value}`;

  await showProgress(text);
};
