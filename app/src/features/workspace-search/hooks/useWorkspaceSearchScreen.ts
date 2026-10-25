import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useMemo } from 'react';

import { PATHS } from '@/shell/config';
import { useFeature } from '@/shell/capabilities';
import { showToast } from '@/shared/utils/toast.utils';

import { workspaceSearchKeys } from '../api';
import { useWorkspaceSearchQuery } from '../queries/workspace-search.queries';
import { describeWorkspaceSearchError, type WorkspaceSearchError } from '../utils/search-error';
import { useIsOffline } from './useIsOffline';
import { useSearchCriteria, type SearchCriteriaOptions } from './useSearchCriteria';
import { useTabCounts } from './useTabCounts';

export type SearchStatus =
  'disabled' | 'empty' | 'error' | 'hint' | 'loading' | 'offline' | 'results';

/**
 * Toàn bộ logic màn tìm toàn nhóm (tách khỏi JSX để màn giữ dưới trần dòng — `feature-structure.md`): tiêu chí (từ
 * khoá/tab/bộ lọc) → kiểm hợp lệ TRƯỚC khi gọi API → suy trạng thái hiển thị, số đếm từng tab, tự đi tiếp khi một trang
 * rỗng dù `hasMore`, rời màn khi mất quyền vào nhóm.
 */
export function useWorkspaceSearchScreen(options: SearchCriteriaOptions) {
  const { workspaceId } = options;
  const queryClient = useQueryClient();
  const criteria = useSearchCriteria(options);
  const offline = useIsOffline();
  // `undefined` = chưa biết (đang tải cờ): chưa kết luận "tắt". Đã tắt thì không bắn request nào.
  const featureOn = useFeature('workspaceSearch');
  const { check, filters, params, tab, tabs } = criteria;

  const enabled = check.issue === null && featureOn !== false && !offline;
  const query = useWorkspaceSearchQuery(workspaceId, params, enabled);
  const {
    fetchNextPage,
    hasNextPage,
    isFetching,
    isFetchingNextPage,
    isPending,
    isPlaceholderData,
  } = query;

  // Kết quả CŨ (placeholder) chỉ đáng hiện khi lượt mới đang thật sự chạy; mất mạng thì không có lượt mới để chờ.
  const rows = useMemo(
    () =>
      check.issue === null && (enabled || !isPlaceholderData)
        ? (query.data?.pages.flatMap((page) => page.data) ?? [])
        : [],
    [check.issue, enabled, isPlaceholderData, query.data],
  );
  const lastMeta = query.data?.pages.at(-1)?.meta;
  const partial = rows.length > 0 && (query.data?.pages.some((page) => page.meta.partial) ?? false);
  const truncated = rows.length > 0 && (lastMeta?.truncated ?? false);

  const hasError = enabled && query.isError;
  const error: WorkspaceSearchError | null = useMemo(
    () => (hasError ? describeWorkspaceSearchError(query.error) : null),
    [hasError, query.error],
  );
  const workspaceGone = error?.kind === 'workspace-gone';

  /** BE lấy `limit+1` rồi lọc; trang có thể RỖNG mà `hasMore: true` — đi tiếp thay vì báo "không có kết quả". */
  useEffect(() => {
    if (enabled && rows.length === 0 && hasNextPage && !isFetching && !hasError)
      void fetchNextPage();
  }, [enabled, rows.length, hasNextPage, isFetching, hasError, fetchNextPage]);

  useEffect(() => {
    if (!workspaceGone) return undefined;
    showToast('info', 'Bạn không còn quyền xem nhóm này.');
    router.replace(PATHS.WORKSPACES);
    // Nội dung tin/tệp của nhóm không còn quyền xem KHÔNG được nằm lại trong cache (`gcTime` 2 phút vẫn là quá dài). Dọn khi màn bị
    // GỠ, không dọn ngay: query còn đang được quan sát — xoá lúc này làm nó tự dựng lại và bắn thêm một request 404 nữa.
    return () => queryClient.removeQueries({ queryKey: workspaceSearchKeys.results(workspaceId) });
  }, [workspaceGone, queryClient, workspaceId]);

  // Số đếm từng tab đọc từ cache kết quả nhưng PHẢN ỨNG khi cache đổi — xem `useTabCounts` (không đọc cache thẳng trong lúc vẽ).
  const tabTypes = useMemo(() => tabs.map((item) => item.key), [tabs]);
  const counts = useTabCounts(
    workspaceId,
    check.issue === null ? check.text : null,
    filters,
    tabTypes,
  );

  let status: SearchStatus;
  if (featureOn === false || error?.kind === 'feature-off') status = 'disabled';
  else if (check.issue !== null) status = 'hint';
  else if (rows.length > 0) status = 'results';
  else if (offline || error?.kind === 'offline') status = 'offline';
  else if (error) status = 'error';
  else if (isPending || isFetching || hasNextPage) status = 'loading';
  else status = 'empty';

  return {
    ...criteria,
    counts,
    error,
    /** Đổi mỗi lần lỗi mới — làm `key` để `RateLimitNotice` dựng lại bộ đếm với số giây mới. */
    errorStamp: query.errorUpdatedAt,
    fetchNextPage: () => void fetchNextPage(),
    hasNextPage,
    isFetchingNextPage,
    /** Đang hiện kết quả CŨ trong lúc chờ kết quả của từ khoá/bộ lọc mới. */
    isStale: isPlaceholderData,
    partial,
    retry: () => void query.refetch(),
    rows,
    status,
    tab,
    truncated,
  };
}
