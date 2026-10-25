import { useInfiniteQuery } from '@tanstack/react-query';

import { conversationsService } from '../api/conversations.service';
import { conversationKeys } from '../api/conversations.keys';
import type { ConversationRole } from '../api/conversations.types';

/**
 * `GET /conversations/:id/members` — be.md §3 `listMembersQuerySchema` KHÔNG
 * có `q` (chỉ `cursor`/`limit`/`role`) khác app.md §3 "tìm" — `GroupMembersScreen`
 * tự lọc CLIENT trên các trang đã tải (cùng cách `ChannelListScreen` lọc danh
 * sách "Kênh của bạn"), `role` vẫn lọc SERVER vì DTO có hỗ trợ.
 *
 * `enabled` (mặc định bật): `useConversationAuthors` gọi hook này cho MỌI hội thoại
 * nhưng chỉ GROUP mới cần danh sách — DIRECT đã có `peer`, không tốn request.
 */
export function useGroupMembers(conversationId: string, role?: ConversationRole, enabled = true) {
  return useInfiniteQuery({
    queryKey: [...conversationKeys.members(conversationId), role ?? 'ALL'],
    queryFn: ({ pageParam }) => conversationsService.listMembers(conversationId, { cursor: pageParam, limit: 50, role }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => (last.meta.hasMore ? (last.meta.nextCursor ?? undefined) : undefined),
    enabled: enabled && Boolean(conversationId),
    staleTime: 60_000,
  });
}
