import { useCallback, useEffect, useMemo } from 'react';

import { useAuthStore } from '@/shell/store/slices/auth';

import { recentSearchKey, useWorkspaceSearchStore } from '../store/workspace-search.store';

const EMPTY: readonly string[] = [];

export interface RecentSearches {
  add: (term: string) => void;
  clear: () => void;
  items: readonly string[];
  remove: (term: string) => void;
}

/**
 * Tìm gần đây của MỘT nhóm (app.md p5-04 §2/§5): tối đa 10 từ khoá, lưu cục bộ theo `(userId, wsId)` — không có phiên thì
 * không đọc/ghi gì. Nạp từ đĩa một lần khi mở màn; danh sách rỗng trong lúc nạp (nơi gọi không cần chờ vì "chưa có gì"
 * và "đang nạp" cùng vẽ ra một khối gợi ý).
 */
export function useRecentSearches(workspaceId: string): RecentSearches {
  const userId = useAuthStore((state) => state.user?.id);
  const key = userId ? recentSearchKey(userId, workspaceId) : null;
  const items = useWorkspaceSearchStore((state) => (key ? state.recents[key] : undefined)) ?? EMPTY;

  useEffect(() => {
    if (key) void useWorkspaceSearchStore.getState().hydrate(key);
  }, [key]);

  const add = useCallback(
    (term: string) => {
      if (key) useWorkspaceSearchStore.getState().add(key, term);
    },
    [key],
  );
  const remove = useCallback(
    (term: string) => {
      if (key) useWorkspaceSearchStore.getState().remove(key, term);
    },
    [key],
  );
  const clear = useCallback(() => {
    if (key) useWorkspaceSearchStore.getState().clear(key);
  }, [key]);

  // Đối tượng ỔN ĐỊNH: nơi gọi đưa nó vào deps của `useCallback`/`useMemo`, đổi mỗi lần vẽ là mất tác dụng memo.
  return useMemo(() => ({ add, clear, items, remove }), [add, clear, items, remove]);
}
