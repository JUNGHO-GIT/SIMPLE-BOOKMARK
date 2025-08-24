// types/BookmarkTypes.ts

// 북마크 히스토리 액션 인터페이스
export interface BookmarkHistoryAction {
    type: 'create' | 'delete' | 'copy' | 'move' | 'bookmark' | 'unbookmark';
    items: BookmarkHistoryItem[];
    targetPath?: string;
    timestamp: number;
}

// 북마크 히스토리 항목 인터페이스
export interface BookmarkHistoryItem {
    path: string;
    isFile: boolean;
    content?: Uint8Array;
    children?: BookmarkHistoryItem[];
    originalPath?: string;
}

// 북마크 설정 인터페이스
export interface BookmarkConfig {
    maxHistorySize: number;
    autoRefresh: boolean;
    syncInterval: number;
}

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
