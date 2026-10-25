import type { QueryClient } from '@tanstack/react-query';

import { notificationKeys } from '@/core/notifications';

import { conversationKeys } from '../api/conversations.keys';
import type { ConversationDetail, ConversationListItem } from '../api/conversations.types';
import { patchPinned } from './conversation-side-caches';
import type { ConversationMemberUpdatedSelfEvent } from './conversation-socket-events.types';

/**
 * `conversation:member-updated` (cá nhân, mọi máy của mình) — vá cài đặt riêng vào `detail` (nhãn thông báo ở màn Thông tin,
 * `hiddenBeforeSeq` sau khi xoá lịch sử) và mục ghim. Gọi SAU khi đã so `hiddenBeforeSeq` để quyết định xoá cache tin.
 * Tách khỏi `conversation-side-caches.ts` (trần 150 dòng).
 */
export function applySelfSettingsToSideCaches(
  queryClient: QueryClient,
  payload: ConversationMemberUpdatedSelfEvent,
): void {
  const fields: Partial<ConversationListItem> = {
    ...(payload.pinnedAt !== undefined && { pinnedAt: payload.pinnedAt }),
    ...(payload.archivedAt !== undefined && { archivedAt: payload.archivedAt }),
    ...(payload.markedUnread !== undefined && { markedUnread: payload.markedUnread }),
    ...(payload.notifyMode !== undefined && {
      notifyMode: payload.notifyMode,
      muted: payload.notifyMode === 'MUTED',
    }),
  };
  const hidden = payload.hiddenBeforeSeq;
  queryClient.setQueryData<ConversationDetail>(
    conversationKeys.detail(payload.conversationId),
    (detail) =>
      detail
        ? {
            ...detail,
            ...fields,
            ...(hidden !== undefined && {
              hiddenBeforeSeq: Math.max(detail.hiddenBeforeSeq, hidden),
            }),
          }
        : detail,
  );
  // Ghim/bỏ ghim đổi THÀNH PHẦN của mục ghim (không thêm hàng tại chỗ được) — lấy lại; cài đặt khác thì vá tại chỗ.
  if (payload.pinnedAt !== undefined)
    void queryClient.invalidateQueries({ queryKey: conversationKeys.pinned() });
  else patchPinned(queryClient, payload.conversationId, (item) => ({ ...item, ...fields }));
  // Lưu trữ/bỏ lưu trữ, đánh dấu chưa đọc: hàng phải VÀO danh sách chưa chứa nó (Lưu trữ, "Chưa đọc") — vá tại chỗ chỉ gỡ được.
  if (payload.archivedAt !== undefined || payload.markedUnread !== undefined) {
    void queryClient.invalidateQueries({ queryKey: [...conversationKeys.all, 'list'] });
    void queryClient.invalidateQueries({ queryKey: conversationKeys.archivedPeek() });
  }
  // Tắt tiếng/đánh dấu chưa đọc đổi con số trên tab Tin nhắn (tóm tắt chưa đọc bỏ qua hội thoại tắt tiếng).
  if (payload.notifyMode !== undefined || payload.markedUnread !== undefined) {
    void queryClient.invalidateQueries({ queryKey: notificationKeys.unreadSummary });
  }
}
