import { useMutation, useQueryClient, type InfiniteData } from '@tanstack/react-query';

import {
  inboxService,
  notificationKeys,
  type InboxFilter,
  type InboxItem,
  type InboxPage,
  type UnreadSummary,
} from '@/core/notifications';
import { dropActivity, markInboxBefore, markInboxItemsRead } from '@/shared/notifications';

type InboxLists = [readonly unknown[], InfiniteData<InboxPage> | undefined][];

const LIST_KEY = [...notificationKeys.inboxAll, 'list'] as const;

/**
 * Đánh dấu đọc từng mục / tất cả (p1-07 `app.md` §4.5) — LẠC QUAN, lỗi thì khôi phục.
 *
 * ⛔ KHÔNG tự toast lỗi: `apiClient` đã toast đúng một lần (thêm ở đây là toast đôi). `NOTI_002` (mục không còn) khi
 * đánh dấu một mục là vô hại — giữ trạng thái đã đọc thay vì khôi phục.
 */
export function useInboxActions() {
  const queryClient = useQueryClient();

  const readOne = useMutation({
    mutationFn: (item: InboxItem) => inboxService.markRead(item.id),
    onMutate: async (item) => {
      await queryClient.cancelQueries({ queryKey: notificationKeys.inboxAll });
      const lists: InboxLists = queryClient.getQueriesData<InfiniteData<InboxPage>>({ queryKey: LIST_KEY });
      const summary = queryClient.getQueryData<UnreadSummary>(notificationKeys.unreadSummary);
      queryClient.setQueriesData<InfiniteData<InboxPage>>({ queryKey: LIST_KEY }, (data) =>
        markInboxItemsRead(data, new Set([item.id]), new Date().toISOString()),
      );
      if (item.readAt === null) {
        queryClient.setQueryData<UnreadSummary>(notificationKeys.unreadSummary, (s) => dropActivity(s, 1));
      }
      return { lists, summary };
    },
    onError: (_error, _item, context) => {
      if (!context) return;
      for (const [key, data] of context.lists) queryClient.setQueryData(key, data);
      queryClient.setQueryData(notificationKeys.unreadSummary, context.summary);
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: notificationKeys.unreadSummary }),
  });

  const readAll = useMutation({
    mutationFn: (input: { before: string; filter: InboxFilter; workspaceId?: string }) =>
      inboxService.readAll(input),
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: notificationKeys.inboxAll });
      // Chỉ danh sách ĐANG xem chắc chắn khớp bộ lọc; các bộ lọc khác đối chiếu với server sau (xem `onSettled`).
      const key = notificationKeys.inboxList({ filter: input.filter, workspaceId: input.workspaceId });
      const previous = queryClient.getQueryData<InfiniteData<InboxPage>>(key);
      queryClient.setQueryData<InfiniteData<InboxPage>>(key, (data) =>
        markInboxBefore(data, input.before, new Date().toISOString()),
      );
      return { key, previous };
    },
    onError: (_error, _input, context) => {
      if (context) queryClient.setQueryData(context.key, context.previous);
    },
    // Số chuẩn (mục thuộc bộ lọc khác, mục tới sau `before`) — làm mới cả hộp thư lẫn tóm tắt.
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: notificationKeys.inboxAll });
      void queryClient.invalidateQueries({ queryKey: notificationKeys.unreadSummary });
    },
  });

  return { readAll, readOne };
}
