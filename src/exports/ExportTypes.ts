// exports/ExportTypes.ts

import type { BookmarkCommand as BmCmd } from "@exportCommands";
import type { BookmarkProvider as BmProvFctr } from "@exportProviders";
import type { BookmarkOperationService as BmOpSvcFctr, BookmarkSyncService as BmSySvFc } from "@exportServices";
import type { Minimatch } from "minimatch";
import type { TreeItem } from "vscode";

// 북마크 메타데이터 인터페이스 ――――――――――――――――――――――――――――――――――――――――――――――――-
export interface BookmarkMetadata {
  bookmarkName: string;
  createdAt: number;
  isFile: boolean;
  lastSyncAt: number;
  originalExists: boolean;
  originalPath: string;
}
// 북마크 항목 상태 ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export enum BookmarkStatus {
  SYNCED = "synced",
  MODIFIED = "modified",
  MISSING = "missing",
  ERROR = `error`,
}
// commands ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――--
export type BookmarkCommandType = ReturnType<typeof BmCmd>;
export type ExcludeRuleType = {
  matcher: Minimatch;
  when?: string;
};

// models ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――-
export type BookmarkModelType = TreeItem & {
  originalPath: string;
  bookmarkMetadata: BookmarkMetadata;
  status: BookmarkStatus;
  isOriginalAvailable: boolean;
  updateStatus: (newStatus: BookmarkStatus) => void;
  _ancestorPaths?: Set<string>;
};

// providers ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――-
export type BookmarkProviderType = ReturnType<typeof BmProvFctr>;

// services ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――--
export type BookmarkOperationServiceType = ReturnType<typeof BmOpSvcFctr>;
export type BookmarkSyncServiceType = ReturnType<typeof BmSySvFc>;
