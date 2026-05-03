// models/BookmarkModel.ts

import { vscode } from "@exportLibs";
import type { BookmarkMetadata, BookmarkModelType } from "@exportTypes";
import { BookmarkStatus } from "@exportTypes";

export const BookmarkModel = (metadata: BookmarkMetadata, status: BookmarkStatus=BookmarkStatus.SYNCED, options?: { contextValueOverride?: string }): BookmarkModelType => {
  // 0. 변수 설정 ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――-
  const collapsibleState = metadata.isFile ? vscode.TreeItemCollapsibleState.None : vscode.TreeItemCollapsibleState.Collapsed;
  const base = new vscode.TreeItem(metadata.bookmarkName, collapsibleState) as BookmarkModelType;

  // 1-1. 표시 속성 갱신
  const setupDisplay = (item: BookmarkModelType): void => {
    const baseName = item.bookmarkMetadata.bookmarkName;
    item.label = baseName;
    const [desc, colorId] = item.status === BookmarkStatus.SYNCED ? [``, `foreground`] : item.status === BookmarkStatus.MISSING ? [`(missing)`, `errorForeground`] : item.status === BookmarkStatus.MODIFIED ? [`(modified)`, `gitModified`] : [`(error)`, `errorForeground`];

    item.description = desc;
    item.iconPath = item.bookmarkMetadata.isFile ? new vscode.ThemeIcon(`file`, new vscode.ThemeColor(colorId)) : new vscode.ThemeIcon(`folder`, new vscode.ThemeColor(colorId));

    item.tooltip = new vscode.MarkdownString(`**${item.bookmarkMetadata.bookmarkName}**\n\n**Original Path:** ${item.originalPath}`);

    item.command = item.bookmarkMetadata.isFile && item.status === BookmarkStatus.SYNCED ? {
          command: `vscode.open`,
          title: `Open Original File`,
          arguments: [vscode.Uri.file(item.originalPath)],
        } : undefined;
  };

  // 1-2. 상태 갱신
  const updateStatus = function (this: BookmarkModelType, newStatus: BookmarkStatus): void {
    if (this.status !== newStatus) {
    	this.status = newStatus;
      setupDisplay(this);
    }
  };

  // 1-3. 원본 사용 가능 여부 계산
  const computeIsOriginalAvailable = (status: BookmarkStatus): boolean => status === BookmarkStatus.SYNCED || status === BookmarkStatus.MODIFIED;

  // 1-4. 베이스 속성 주입
  base.originalPath = metadata.originalPath;
  base.bookmarkMetadata = metadata;
  base.status = status;
  base.id = metadata.originalPath;
  base.resourceUri = vscode.Uri.file(metadata.originalPath);
  base.contextValue = options?.contextValueOverride ?? (metadata.isFile ? `bookmarkFile` : `bookmarkFolder`);
  base.updateStatus = updateStatus.bind(base);

  Object.defineProperty(base, "isOriginalAvailable", {
    get(): boolean {
      return computeIsOriginalAvailable(base.status);
    },
  });
  setupDisplay(base);

  // 99. return ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――--
  return base;
};
