// utils/BookmarkPathUtil.ts

import * as path from "path";
import * as fs from "fs";

// -----------------------------------------------------------------------------------------
export const getTargetFileName = (dir: string, fileName: string): string => fileName;

// -----------------------------------------------------------------------------------------
export const getBookmarkPath = (workspaceRoot: string): string => path.join(workspaceRoot, ".bookmark");

// -----------------------------------------------------------------------------------------
export const isWithinBookmark = (itemPath: string, bookmarkPath: string): boolean => itemPath.startsWith(bookmarkPath);

// -----------------------------------------------------------------------------------------
export const validateFileName = (fileName: string): string | null => (
	(!fileName || !fileName.trim()) ? "File name cannot be empty" :
	(fileName.includes("/") || fileName.includes("\\")) ? "Invalid characters in file name" :
	null
);

// -----------------------------------------------------------------------------------------
export const exists = (filePath: string): boolean => fs.existsSync(filePath);
