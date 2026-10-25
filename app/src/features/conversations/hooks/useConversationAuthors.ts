import { useEffect, useMemo } from 'react';

import type { ResolveChatAuthor } from '@/features/chat';
import { useAuthStore } from '@/shell/store/slices/auth';

import type { ConversationDetail } from '../api/conversations.types';
import { buildAuthorResolver, type AuthorSource } from '../utils/author-resolver';
import { useGroupMembers } from './useGroupMembers';

/** 4 trang × 50 = 200 = `LIMITS.conversation.membersMax` — hết trần thành viên nhóm. */
const MAX_MEMBER_PAGES = 4;

/**
 * `resolveAuthor` cho `ChatRoom` của một hội thoại (app.md p1-05 §3): DIRECT lấy
 * từ `peer` (đã có sẵn trong chi tiết, không thêm request), GROUP kéo hết trang
 * `GET /conversations/:id/members` (dùng CHUNG cache với `GroupMembersScreen`).
 * Không chặn hiển thị chờ danh sách — lúc đầu bong bóng hiện tên tối giản, có
 * dữ liệu thì tự cập nhật (hàm trả về đổi tham chiếu).
 */
export function useConversationAuthors(conversation: ConversationDetail | undefined): ResolveChatAuthor {
  const self = useAuthStore((state) => state.user);
  const isGroup = conversation?.kind === 'GROUP';
  // Tách `peer` ra biến riêng: React Compiler suy phụ thuộc là cả `conversation`, không khớp `conversation?.peer` khai tay.
  const peer = conversation?.peer;
  const { data, hasNextPage, isFetchingNextPage, fetchNextPage } = useGroupMembers(
    conversation?.id ?? '',
    undefined,
    isGroup,
  );
  const pageCount = data?.pages.length ?? 0;

  useEffect(() => {
    if (isGroup && hasNextPage && !isFetchingNextPage && pageCount < MAX_MEMBER_PAGES) void fetchNextPage();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage, isGroup, pageCount]);

  return useMemo(() => {
    const sources: AuthorSource[] = isGroup
      ? (data?.pages.flatMap((page) => page.data) ?? [])
      : peer
        ? [peer]
        : [];
    return buildAuthorResolver(sources, self);
  }, [peer, data, isGroup, self]);
}
