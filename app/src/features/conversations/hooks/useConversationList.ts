import { useInfiniteQuery, useQuery } from '@tanstack/react-query';

import { conversationsService } from '../api/conversations.service';
import { conversationKeys } from '../api/conversations.keys';
import type { ConversationFilter } from '../api/conversations.types';

/** Danh sách hội thoại theo chip lọc + tìm — `useInfiniteQuery` phân trang cursor (be.md §4). */
export function useConversationList(filter: ConversationFilter, q?: string, workspaceId?: string) {
  return useInfiniteQuery({
    queryKey: conversationKeys.list({ filter, q, workspaceId }),
    queryFn: ({ pageParam }) =>
      conversationsService.list({ filter, q, workspaceId, cursor: pageParam, limit: 30 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => (last.meta.hasMore ? (last.meta.nextCursor ?? undefined) : undefined),
    staleTime: 30_000,
  });
}

/**
 * "Đã ghim" trên cùng danh sách — TRUY VẤN SONG SONG với filter đang chọn
 * (app.md §2 "infinite + pinned query song song"), không phải một trang khác
 * của cùng query: `filter=pinned` của BE không nhận `cursor` (≤ 20, be.md §5.6).
 */
export function usePinnedConversations() {
  return useQuery({
    queryKey: conversationKeys.pinned(),
    queryFn: () => conversationsService.list({ filter: 'pinned', limit: 20 }).then((page) => page.data),
    staleTime: 30_000,
  });
}
