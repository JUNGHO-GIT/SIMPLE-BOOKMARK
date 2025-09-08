// types/BookmarkTypes.ts

// 북마크 메타데이터 인터페이스
export interface BookmarkMetadata {
	originalPath: string;
	bookmarkName: string;
	isFile: boolean;
	createdAt: number;
	lastSyncAt: number;
	originalExists: boolean;
}

// 북마크 항목 상태
export enum BookmarkStatus {
	SYNCED = 'synced',
	MODIFIED = 'modified',
	MISSING = 'missing',
	ERROR = 'error'
}
