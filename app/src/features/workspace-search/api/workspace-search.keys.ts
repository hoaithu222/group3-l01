import type { WorkspaceSearchParams } from './workspace-search.types';

/**
 * Khoá cache của "Tìm toàn workspace". MỌI tham số ảnh hưởng kết quả đều nằm trong khoá (`api-data`): thiếu `authorId`/
 * `from`/`scopeId`… thì đổi bộ lọc mà danh sách không đổi và người dùng đọc ra là "bộ lọc hỏng".
 */
export const workspaceSearchKeys = {
  all: ['workspace-search'] as const,
  /** Tiền tố để `removeQueries` mọi kết quả của MỘT nhóm khi mất quyền/rời nhóm (nội dung tin không được giữ lại). */
  results: (workspaceId: string) => [...workspaceSearchKeys.all, 'results', workspaceId] as const,
  search: (workspaceId: string, params: WorkspaceSearchParams) =>
    [...workspaceSearchKeys.results(workspaceId), params] as const,
  authors: (workspaceId: string, q: string) =>
    [...workspaceSearchKeys.all, 'authors', workspaceId, q] as const,
  scopes: (workspaceId: string) => [...workspaceSearchKeys.all, 'scopes', workspaceId] as const,
};

/**
 * Khoá cache CHUNG với `useWorkspace()` của feature `workspaces` (`['workspaces','detail',wsId]`): cùng URL, cùng phản hồi
 * thật (`WorkspaceDetail` đầy đủ) — chỉ khai kiểu HẸP hơn ở đây cho phần này đọc tới (vai trò của mình). Cùng lý do
 * `useCanCreateChannel` của `channels` dùng chung khoá này; không import `workspaces`.
 */
export function workspaceDetailKey(workspaceId: string) {
  return ['workspaces', 'detail', workspaceId] as const;
}
