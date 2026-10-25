import type { ListSetsParams } from '../api/study.types';

/**
 * Khoá React Query của `study` (app.md p4-01 §4).
 *
 * ⚠️ Bộ học thuộc về TÁC GIẢ hoặc NHÓM: `permission:revoked` của workspace không dọn được chúng bằng
 * `matchesScope()` (khoá không theo khuôn `[domain, scopeType, scopeId]`), nên danh sách nhóm mang `wsId` ở
 * `params` và màn nhóm tự `removeQueries` khi mất quyền — xem `WorkspaceStudyScreen`.
 */
export const studyKeys = {
  all: ['study-sets'] as const,
  list: (params: ListSetsParams) => ['study-sets', 'list', params.scope, params] as const,
  detail: (setId: string) => ['study-sets', 'detail', setId] as const,
  items: (setId: string) => ['study-sets', 'items', setId] as const,
  tags: (workspaceId?: string) => ['study-sets', 'tags', workspaceId ?? 'all'] as const,
  workspaceAccess: (workspaceId: string) =>
    ['study-sets', 'workspace-access', workspaceId] as const,
};
