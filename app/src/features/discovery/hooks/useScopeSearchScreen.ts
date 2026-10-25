import { useEffect, useMemo, useState } from 'react';
import { router } from 'expo-router';

import { useSearchInput } from '@/shared/ui/search';
import { showToast } from '@/shared/utils/toast.utils';

import type { DiscoveryScope } from '../api/discovery.types';
import { useScopeSearchQuery } from '../queries/search.queries';
import { describeDiscoveryError, type DiscoveryErrorInfo } from '../utils/error-info';
import { buildSearchParams, EMPTY_FILTERS, type SearchFilters } from '../utils/search-params';
import { validateSearchText, type SearchTextIssue } from '../utils/search-query';
import { useScopeDiscoverySocket } from './useScopeDiscoverySocket';
import { useSearchLimits } from './useSearchLimits';

/** Nhịp chờ sau phím cuối — 400 ms (README p1-09 §3.1), dài hơn 300 ms mặc định vì mỗi lượt tốn hạn mức 30 lần/phút. */
export const SCOPE_SEARCH_DEBOUNCE_MS = 400;

export type SearchStatus = 'empty' | 'error' | 'hint' | 'loading' | 'results';

/**
 * Toàn bộ logic màn tìm (tách khỏi JSX để màn giữ dưới trần dòng — `feature-structure.md`): từ khoá + bộ lọc, kiểm hợp
 * lệ TRƯỚC khi gọi API, suy trạng thái hiển thị, tự đi tiếp khi một trang rỗng dù `hasMore`, rời màn khi mất quyền.
 */
export function useScopeSearchScreen(scope: DiscoveryScope) {
  const limits = useSearchLimits();
  // ⛔ Ô nhập UNCONTROLLED (`useSearchInput`): controlled + debounce ghi đè ô giữa lúc Telex đang ghép dấu (mất dấu/nhảy con trỏ).
  const input = useSearchInput({ delay: SCOPE_SEARCH_DEBOUNCE_MS });
  const [filters, setFilters] = useState<SearchFilters>(EMPTY_FILTERS);

  const check = useMemo(() => validateSearchText(input.value, limits), [input.value, limits]);
  const params = useMemo(() => buildSearchParams(check.text, filters), [check.text, filters]);
  const enabled = check.issue === null;
  const query = useScopeSearchQuery(scope, params, enabled);
  useScopeDiscoverySocket(scope);

  const { fetchNextPage, hasNextPage, isFetching, isFetchingNextPage, isPending } = query;
  const hits = useMemo(
    () => (enabled ? (query.data?.pages.flatMap((page) => page.data) ?? []) : []),
    [enabled, query.data],
  );
  const partial = enabled && (query.data?.pages.some((page) => page.meta.partial) ?? false);
  const hasError = enabled && query.isError;
  const error: DiscoveryErrorInfo | null = hasError ? describeDiscoveryError(query.error) : null;
  const noAccess = error?.kind === 'no-access';

  /** BE lấy `limit+1` rồi lọc tin ẩn/thu hồi → trang có thể RỖNG mà `hasMore: true`: đi tiếp thay vì báo "không có kết quả". */
  useEffect(() => {
    if (enabled && hits.length === 0 && hasNextPage && !isFetching && !hasError)
      void fetchNextPage();
  }, [enabled, hits.length, hasNextPage, isFetching, hasError, fetchNextPage]);

  useEffect(() => {
    if (!noAccess) return;
    showToast('info', 'Bạn không còn quyền xem nội dung này.');
    router.back();
  }, [noAccess]);

  let status: SearchStatus;
  if (!enabled) status = 'hint';
  else if (hits.length > 0) status = 'results';
  else if (hasError) status = 'error';
  else if (isPending || isFetching || hasNextPage) status = 'loading';
  else status = 'empty';

  return {
    input,
    filters,
    setFilters,
    clearFilters: () => setFilters(EMPTY_FILTERS),
    issue: check.issue as SearchTextIssue | null,
    status,
    hits,
    partial,
    error,
    /** Đang hiện kết quả CŨ trong lúc chờ kết quả của bộ lọc/từ khoá mới. */
    isStale: query.isPlaceholderData,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage: () => void fetchNextPage(),
    retry: () => void query.refetch(),
    /** Đổi mỗi lần lỗi mới — làm `key` để `RateLimitNotice` dựng lại bộ đếm với số giây mới. */
    errorStamp: query.errorUpdatedAt,
  };
}
