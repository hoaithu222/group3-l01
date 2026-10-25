export type SavedScopeFilter = 'CHANNEL' | 'CONVERSATION';

/** Bộ lọc của `GET /me/saved` — MỌI tham số ảnh hưởng kết quả đều nằm trong khoá cache (`api-data`). */
export interface SavedListFilter {
  scopeType?: SavedScopeFilter;
  workspaceId?: string;
}

/**
 * Khoá cache "tin đã lưu". Nằm ở `shared/` vì `useSaveActions`/`useSavedSync` (dùng chung với `chat`) phải
 * `invalidate` đúng danh sách mà `discovery` đọc — không feature nào import khoá của feature khác.
 */
export const savedKeys = {
  all: ['saved'] as const,
  list: (filter: SavedListFilter) => [...savedKeys.all, 'list', filter] as const,
};
