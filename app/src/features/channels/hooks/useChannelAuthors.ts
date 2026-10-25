import { useEffect, useMemo } from 'react';

import type { ResolveChatAuthor } from '@/features/chat';
import { useAuthStore } from '@/shell/store/slices/auth';

import { useChannelMemberDirectory } from '../queries/channel-members.queries';
import { buildAuthorResolver } from '../utils/author-resolver';

/** 10 trang × 100 = 1000 người — trần an toàn; kênh lớn hơn thì tác giả ngoài danh sách hiện tên tối giản. */
const MAX_DIRECTORY_PAGES = 10;

/**
 * `resolveAuthor` cho `ChatRoom` của một kênh, dựng từ `GET /channels/:id/members`
 * (app.md p1-03 §2). Không chặn hiển thị chờ danh sách: lúc đầu chưa có ai trong
 * bộ tra thì bong bóng hiện tên tối giản, có dữ liệu thì tự cập nhật (hàm trả về
 * ĐỔI tham chiếu khi dữ liệu đổi, `MessageList` vẽ lại đúng lúc đó).
 */
export function useChannelAuthors(chId: string): ResolveChatAuthor {
  const self = useAuthStore((state) => state.user);
  const { data, hasNextPage, isFetchingNextPage, fetchNextPage } = useChannelMemberDirectory(chId);
  const pageCount = data?.pages.length ?? 0;

  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage && pageCount < MAX_DIRECTORY_PAGES) void fetchNextPage();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage, pageCount]);

  return useMemo(
    () => buildAuthorResolver(data?.pages.flatMap((page) => page.items) ?? [], self),
    [data, self],
  );
}
