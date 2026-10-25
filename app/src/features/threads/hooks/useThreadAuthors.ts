import { useEffect, useMemo } from 'react';

import type { ResolveChatAuthor } from '@/features/chat';
import { useAuthStore } from '@/shell/store/slices/auth';

import { useThreadAuthorDirectory } from '../queries/threads.queries';

/** 10 trang × 100 = 1000 người — trần an toàn; kênh lớn hơn thì tác giả ngoài danh sách hiện tên tối giản. */
const MAX_PAGES = 10;

/**
 * `resolveAuthor` cho `<ChatRoom>` của màn luồng: `userId → tên/ảnh` dựng từ danh bạ kênh. Không chặn hiển thị
 * chờ danh bạ — chưa có thì bong bóng hiện tên tối giản, có dữ liệu thì hàm trả về ĐỔI tham chiếu nên danh sách vẽ lại.
 *
 * Chính mình là dự phòng (người xem có thể không nằm trong danh bạ, vd kênh công khai chưa tham gia). Tác giả không
 * có trong cả hai (đã rời kênh) → `undefined`, `chat` tự hiện tên tối giản.
 */
export function useThreadAuthors(channelId: string): ResolveChatAuthor {
  const self = useAuthStore((state) => state.user);
  const { data, hasNextPage, isFetchingNextPage, fetchNextPage } =
    useThreadAuthorDirectory(channelId);
  const pageCount = data?.pages.length ?? 0;

  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage && pageCount < MAX_PAGES) void fetchNextPage();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage, pageCount]);

  return useMemo(() => {
    const byId = new Map<string, { name: string; avatarUrl: string | null }>();
    for (const page of data?.pages ?? []) {
      for (const member of page.items)
        byId.set(member.userId, { name: member.name, avatarUrl: member.avatarUrl });
    }
    if (self && !byId.has(self.id))
      byId.set(self.id, { name: self.name, avatarUrl: self.avatar ?? null });
    return (userId: string) => byId.get(userId);
  }, [data, self]);
}
