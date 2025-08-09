// TypedDirectory.ts

import * as vscode from "vscode";

// -----------------------------------------------------------------------------------------------------------------
export type TypedDirectoryType = {
	path: string;
	type: vscode.FileType;
};

// -----------------------------------------------------------------------------------------------------------------
export const TypedDirectory = (
	path: string,
	type: vscode.FileType
) => ({
	path,
	type
});

// -----------------------------------------------------------------------------------------------------------------
export const buildTypedDirectory = async (
	uri: vscode.Uri
): Promise<TypedDirectoryType> => {

	// 파일 시스템 상태 가져오기
	const type = (await vscode.workspace.fs.stat(uri)).type;

	const finalResult = TypedDirectory(
		uri.fsPath,
		type
	);

	return finalResult;
};