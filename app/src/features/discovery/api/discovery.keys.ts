import { savedKeys } from '@/shared/saved';

import type { DiscoveryScope, ScopeSearchParams } from './discovery.types';

type ScopeRef = Pick<DiscoveryScope, 'scopeId' | 'scopeType'>;

/**
 * Khoá cache của `discovery`. "Đã lưu" dùng `savedKeys` của `shared/saved` (để `useSaveActions`/`useSavedSync` làm mới
 * đúng danh sách này). MỌI tham số ảnh hưởng kết quả đều nằm trong khoá (`api-data`): thiếu `authorId`/`from`… thì đổi
 * bộ lọc mà danh sách không đổi và người dùng đọc ra là "bộ lọc hỏng".
 */
export const discoveryKeys = {
  saved: savedKeys,
  pins: (scope: ScopeRef) => ['discovery', 'pins', scope.scopeType, scope.scopeId] as const,
  /** Tiền tố để `removeQueries` mọi kết quả tìm của MỘT phạm vi khi mất quyền (`channel:revoked`…). */
  searchScope: (scope: ScopeRef) =>
    ['discovery', 'scope-search', scope.scopeType, scope.scopeId] as const,
  search: (scope: ScopeRef, params: ScopeSearchParams) =>
    [...discoveryKeys.searchScope(scope), params] as const,
  members: (scope: ScopeRef, q: string) =>
    ['discovery', 'members', scope.scopeType, scope.scopeId, q] as const,
  workspaces: () => ['discovery', 'workspaces'] as const,
};
