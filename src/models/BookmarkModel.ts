// models/BookmarkModel.ts

import { vscode } from "@exportLibs";
import type { BookmarkMetadata, BookmarkModelType } from "@exportTypes";
import { BookmarkStatus } from "@exportTypes";

// -------------------------------------------------------------------------------------------
export const BookmarkModel = (
	metadata : BookmarkMetadata,
	status : BookmarkStatus = BookmarkStatus.SYNCED,
	options? : {contextValueOverride? : string;}
) : BookmarkModelType => {

	// 0. 변수 설정 ----------------------------------------------------------------------------
	let collapsibleState = metadata.isFile
	? vscode.TreeItemCollapsibleState.None
	: vscode.TreeItemCollapsibleState.Collapsed;
	let base = new vscode.TreeItem(
		metadata.bookmarkName,
		collapsibleState
	) as BookmarkModelType;

	// 항목의 라벨/아이콘/툴팁/명령 갱신 -------------------------------------------------------
	const setupDisplay = (
		item: BookmarkModelType
	): void => {
		const baseName = item.bookmarkMetadata.bookmarkName;
		item.label = baseName;
		const [desc, colorId] = (
			(item.status === BookmarkStatus.SYNCED) ? (
				[``, `foreground`]
			) : (item.status === BookmarkStatus.MISSING) ? (
				[`(missing)`, `errorForeground`]
			) : (item.status === BookmarkStatus.MODIFIED) ? (
				[`(modified)`, `gitModified`]
			) : (
				[`(error)`, `errorForeground`]
			)
		);

		item.description = desc;
		item.iconPath = item.bookmarkMetadata.isFile
		? new vscode.ThemeIcon(`file`, new vscode.ThemeColor(colorId))
		: new vscode.ThemeIcon(`folder`, new vscode.ThemeColor(colorId));

		item.tooltip = new vscode.MarkdownString(
			`**${item.bookmarkMetadata.bookmarkName}**\n\n**Original Path:** ${item.originalPath}`
		);

		item.command = item.bookmarkMetadata.isFile && item.status === BookmarkStatus.SYNCED
			? {
				command: `vscode.open`,
				title: `Open Original File`,
				arguments: [vscode.Uri.file(item.originalPath)]
			}
			: undefined;
	};

	// 상태 변경 시 내부 상태를 갱신하고 표시를 다시 설정 ---------------------------------------
	const updateStatus = function (
		this: BookmarkModelType,
		newStatus: BookmarkStatus
	): void {
		this.status !== newStatus && ((this as any).status = newStatus, setupDisplay(this));
	};

	// 원본 파일이 사용 가능한 상태인지 여부를 계산 --------------------------------------------
	const computeIsOriginalAvailable = (
		status: BookmarkStatus
	): boolean => (
		status === BookmarkStatus.SYNCED || status === BookmarkStatus.MODIFIED
	);

	// 베이스 속성 병합 ----------------------------------------------------------------------
	base = Object.assign(base, {
		originalPath: metadata.originalPath,
		bookmarkMetadata: metadata,
		status: status,
		id: metadata.originalPath,
		resourceUri: vscode.Uri.file(metadata.originalPath),
		contextValue: options?.contextValueOverride || (metadata.isFile ? `bookmarkFile` : `bookmarkFolder`),
		updateStatus: updateStatus.bind(base),
	}) as BookmarkModelType;

	Object.defineProperty(base, "isOriginalAvailable", {
		get() {
			return computeIsOriginalAvailable(base.status);
		}
	});
	setupDisplay(base);

	// 99. return -----------------------------------------------------------------------------
	return base;
};