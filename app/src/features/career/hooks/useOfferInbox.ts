import { useEffect, useMemo } from 'react';

import type { OfferItem } from '../api/recruiter.types';
import { useMyOffers } from '../queries/offers.queries';
import { matchesGroup, needsAttention, type OfferGroup } from '../utils/offer-format';

/**
 * Hộp thư lời mời theo nhóm (app.md §3). BE chỉ lọc được MỘT `status` mà nhóm "Mới"/"Đã đóng" gồm nhiều trạng thái, nên lọc phía app trên cùng một danh sách.
 * Nhóm khác "Tất cả" mà còn trang chưa tải ⇒ tải nốt (sinh viên hiếm khi có quá vài chục lời mời) — nếu không, "Đã đóng" trống chỉ vì lời mời đóng nằm ở trang sau.
 */
export function useOfferInbox(group: OfferGroup) {
  const query = useMyOffers();
  const all = useMemo<OfferItem[]>(
    () => query.data?.pages.flatMap((page) => page.items) ?? [],
    [query.data],
  );
  const items = useMemo(() => all.filter((o) => matchesGroup(o.status, group)), [all, group]);
  const { fetchNextPage, hasNextPage, isError, isFetchingNextPage } = query;

  // ⚠️ `!isError`: tải trang kế LỖI thì `hasNextPage` vẫn true — thiếu điều kiện này effect gọi lại vô hạn trên đường truyền hỏng.
  useEffect(() => {
    if (group !== 'all' && hasNextPage && !isFetchingNextPage && !isError) void fetchNextPage();
  }, [fetchNextPage, group, hasNextPage, isError, isFetchingNextPage]);

  return {
    all,
    attentionCount: all.filter(needsAttention).length,
    error: query.error,
    hasMore: hasNextPage,
    isError,
    isFetchingMore: isFetchingNextPage,
    isLoading: query.isLoading,
    isRefetching: query.isRefetching,
    items,
    loadMore: () => {
      if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
    },
    refetch: () => void query.refetch(),
  };
}
