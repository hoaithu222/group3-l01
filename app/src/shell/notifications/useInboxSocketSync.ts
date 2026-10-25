import { useQueryClient, type InfiniteData } from '@tanstack/react-query';

import {
  notificationKeys,
  type InboxPage,
  type NotificationCreatedEvent,
  type NotificationReadEvent,
  type UnreadSummary,
} from '@/core/notifications';
import { SocketEvent, useSocketEvent } from '@/core/socket';
import {
  bumpActivity,
  countUnreadIn,
  dropActivity,
  markInboxItemsRead,
} from '@/shared/notifications/unread.cache';

import type { RefreshGroup } from './useRefreshSoon';

const INBOX_LISTS = [...notificationKeys.inboxAll, 'list'] as const;

/**
 * `notification:created` / `notification:read` (room `user:{me}`, p1-07 be.md §15.5) → huy hiệu Hoạt động + hộp thư.
 *
 *  · created: +1 huy hiệu ngay; hộp thư LÀM MỚI thay vì chèn dở — payload không đủ dựng một `InboxItem` có `context`
 *    (tên phạm vi/trích dẫn tính lúc đọc, kiểm quyền hiện tại);
 *  · read `{ ids }`: đặt `readAt` ở mọi bộ lọc đang cache, hạ huy hiệu đúng số mục thực sự chuyển từ chưa đọc → đã đọc;
 *  · read `{ all }`: không biết mục nào thuộc bộ lọc nào — đối chiếu với server.
 */
export function useInboxSocketSync(refreshSoon: (group: RefreshGroup) => void): void {
  const queryClient = useQueryClient();

  useSocketEvent<NotificationCreatedEvent>(SocketEvent.NOTIFICATION_CREATED, (event) => {
    queryClient.setQueryData<UnreadSummary>(notificationKeys.unreadSummary, (summary) =>
      bumpActivity(summary, event),
    );
    refreshSoon('inbox');
    refreshSoon('summary');
  });

  useSocketEvent<NotificationReadEvent>(SocketEvent.NOTIFICATION_READ, (event) => {
    if (event.ids) {
      const ids = new Set(event.ids);
      const cached = queryClient.getQueriesData<InfiniteData<InboxPage>>({ queryKey: INBOX_LISTS });
      // Một mục nằm ở nhiều bộ lọc (Tất cả + Nhắc đến bạn) — đếm ở MỘT danh sách: "Tất cả" đủ nhất.
      const reference = cached.find(
        ([key]) => (key[2] as { filter?: string } | undefined)?.filter === 'all',
      )?.[1];
      const dropped = countUnreadIn(reference ?? cached[0]?.[1], ids);
      queryClient.setQueriesData<InfiniteData<InboxPage>>({ queryKey: INBOX_LISTS }, (data) =>
        markInboxItemsRead(data, ids, new Date().toISOString()),
      );
      queryClient.setQueryData<UnreadSummary>(notificationKeys.unreadSummary, (summary) =>
        dropActivity(summary, dropped),
      );
    } else {
      void queryClient.invalidateQueries({ queryKey: notificationKeys.inboxAll });
    }
    refreshSoon('summary');
  });
}
