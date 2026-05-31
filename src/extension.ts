// extension.ts

import { BookmarkCommand as BmCmd } from "@exportCommands";
import { vscode } from "@exportLibs";
import { BookmarkProvider as BmProv } from "@exportProviders";
import { initLogger, logger, notify } from "@exportScripts";
import type { BookmarkCommandType as BmCmdTyp, BookmarkModelType as BmMdlTyp, BookmarkProviderType as BmProvTyp } from "@exportTypes";

// 1-1. deactivate
export const deactivate = () => {};

// 1-2. activate
export const activate = (context: vscode.ExtensionContext) => {

  // 0. Initialize Logger ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
  initLogger();
  logger(`info`, `Simple-Bookmark is now active!`);
  const wsRt = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0 ? vscode.workspace.workspaceFolders[0].uri.fsPath : undefined;

  !wsRt && (() => {
      notify(`warn`, `activate - requires an open workspace to function properly.`);
      logger(`debug`, `activate - no workspace`);
    })();

  const provider = BmProv(wsRt);
  const cmdMgr = BmCmd(provider, context);
  const commands = cmdMgr.registerCommands();
  const treeView = vscode.window.createTreeView(`Simple-Bookmark`, {
    treeDataProvider: provider,
    canSelectMany: true,
    showCollapseAll: true,
  });

  treeView.onDidExpandElement((e) => {
    const p = e.element.originalPath;
    p && provider.markExpanded(p);
  });
  treeView.onDidCollapseElement((e) => {
    const p = e.element.originalPath;
    p && provider.markCollapsed(p);
  });

  const addLstn = stpAddLstn(provider, cmdMgr, treeView);

  context.subscriptions.push(treeView, ...commands, ...addLstn, {
    dispose: () => {
      provider.dispose();
    },
  });
};

// 1-3. 추가 리스너 설정
const stpAddLstn = (provider: BmProvTyp, cmdMgr: BmCmdTyp, treeView: vscode.TreeView<BmMdlTyp>): vscode.Disposable[] => {
  const listeners: vscode.Disposable[] = [];
  let slctTmr: NodeJS.Timeout | null = null;
  let wsTmr: NodeJS.Timeout | null = null;
  let configTimer: NodeJS.Timeout | null = null;

  const selListener = treeView.onDidChangeSelection((e) => {
    slctTmr && clearTimeout(slctTmr);
    slctTmr = setTimeout(() => {
      logger(`debug`, `select - ${e.selection.map((item) => item.label).join(`, `)}`);
      cmdMgr.updateSelectedBookmark(e.selection as BmMdlTyp[]);
      slctTmr = null;
    }, 50);
  });

  const wsLstn = vscode.workspace.onDidChangeWorkspaceFolders(() => {
    wsTmr && clearTimeout(wsTmr);
    wsTmr = setTimeout(() => {
      logger(`debug`, `activate - workspace changed`);
      notify(`info`, `activate - Bookmarks may need to be refreshed.`);
      provider.refresh();
      wsTmr = null;
    }, 200);
  });

  const cfgLstn = vscode.workspace.onDidChangeConfiguration((e) => {
    (e.affectsConfiguration(`Simple-Bookmark`) || e.affectsConfiguration(`files.exclude`)) && (() => {
        configTimer && clearTimeout(configTimer);
        configTimer = setTimeout(() => {
          logger(`debug`, `activate - configuration changed`);
          provider.refresh();
          configTimer = null;
        }, 150);
      })();
  });

  const timerCleanup: vscode.Disposable = {
    dispose: () => {
      slctTmr && clearTimeout(slctTmr);
      wsTmr && clearTimeout(wsTmr);
      configTimer && clearTimeout(configTimer);
      slctTmr = wsTmr = configTimer = null;
    },
  };

  listeners.push(selListener, wsLstn, cfgLstn, timerCleanup);
  return listeners;
};
