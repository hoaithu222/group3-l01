import { useQuery } from '@tanstack/react-query';

import { conversationsService } from '../api/conversations.service';
import { conversationKeys } from '../api/conversations.keys';

/**
 * BE không trả tổng số (`meta` chỉ có `nextCursor`/`hasMore`/`limit`, be.md
 * §4) — dòng "Đã lưu trữ (N)" của app.md §3 không có `N` thật để hiện. Đơn
 * giản hoá: chỉ hiện hàng "Đã lưu trữ" khi có ÍT NHẤT 1 mục (không có số đếm),
 * đúng những gì hợp đồng cho phép biết.
 */
export function useHasArchivedConversations(): boolean {
  const query = useQuery({
    // ⛔ Khoá RIÊNG, không dưới tiền tố `list` — dữ liệu là một trang thường, không phải `InfiniteData` (xem `conversationKeys.archivedPeek`).
    queryKey: conversationKeys.archivedPeek(),
    queryFn: () => conversationsService.list({ filter: 'archived', limit: 1 }),
    staleTime: 30_000,
  });
  return (query.data?.data.length ?? 0) > 0;
}
