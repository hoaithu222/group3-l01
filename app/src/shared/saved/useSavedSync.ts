import { useQueryClient } from '@tanstack/react-query';

import { SocketEvent, useSocketEvent } from '@/core/socket';

import { savedKeys } from './saved.keys';
import { useSavedMessagesStore } from './saved.store';

/** `saved:updated` (room `user:{id}`, be.md p1-09 §6) — CHỈ bắn khi trạng thái thực sự đổi, `saved` là trạng thái MỚI. */
export interface SavedUpdatedEvent {
  v: 1;
  serverNow: string;
  messageId: string;
  saved: boolean;
}

/**
 * Đồng bộ "đã lưu" đa thiết bị: cập nhật cờ của tin + làm mới danh sách "Đã lưu" (app.md p1-09 §4).
 * Mount MỘT lần ở `app/(app)/_layout.tsx` (giống `useConversationSocket`) — không phụ thuộc màn nào đang mở, nên menu
 * tin ở máy này đúng ngay khi máy kia vừa lưu/bỏ lưu. Sự kiện cũng tới cả máy vừa thao tác; `mark` idempotent nên vô hại.
 */
export function useSavedSync(): void {
  const queryClient = useQueryClient();

  useSocketEvent<SavedUpdatedEvent>(SocketEvent.SAVED_UPDATED, (payload) => {
    useSavedMessagesStore.getState().mark(payload.messageId, payload.saved);
    void queryClient.invalidateQueries({ queryKey: savedKeys.all });
  });

  // Socket nối lại (ra nền lâu, mất sóng) ⇒ có thể đã lỡ `saved:updated` của máy khác — lấy lại danh sách "Đã lưu".
  useSocketEvent('connect', () => {
    void queryClient.invalidateQueries({ queryKey: savedKeys.all });
  });
}
