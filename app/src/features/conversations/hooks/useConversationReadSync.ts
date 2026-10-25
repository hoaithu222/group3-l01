import { useQueryClient } from '@tanstack/react-query';

import type { ReadUpdatedEvent } from '@/core/notifications';
import { SocketEvent, useSocketEvent } from '@/core/socket';

import { patchConversationRead } from '../cache/apply-conversation-read';

/**
 * `read:updated` của hội thoại (đọc ở thiết bị KHÁC — p1-07 `app.md` §4.3): hạ chấm/số chưa đọc của hàng danh sách và chi
 * tiết ngay, dùng `unreadCount`/`mentionCount` chuẩn của server. Kênh/luồng do `useReadStateSync` (shell) lo — hook đó
 * không biết khoá cache của feature này, nên phần hội thoại nằm ở đây.
 *
 * Mount MỘT lần ở `(app)/_layout` (cạnh `useConversationSocket`). Sự kiện cũng dội lại máy vừa đặt mốc: vá idempotent nên vô hại.
 */
export function useConversationReadSync(): void {
  const queryClient = useQueryClient();

  useSocketEvent<ReadUpdatedEvent>(SocketEvent.READ_UPDATED, (event) => {
    if (event.streamType !== 'CONVERSATION') return;
    patchConversationRead(queryClient, event.streamId, {
      lastReadSeq: event.lastReadSeq,
      mentionCount: event.mentionCount,
      unreadCount: event.unreadCount,
    });
  });
}
