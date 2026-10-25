import { useMemo } from 'react';

import { useModerationIntentStore } from '@/shared/stores/moderation-intent.store';

export interface ModerationActions {
  /** Menu tin nhắn → tấm Báo cáo (kèm ô "Chặn người gửi" nếu biết tác giả). */
  reportMessage: (message: { id: string; authorId: string | null }) => void;
  reportUser: (userId: string, name?: string, contextWorkspaceId?: string) => void;
  reportChannel: (channelId: string, name?: string) => void;
  /** Nhóm chat. ⚠️ KHÔNG dùng cho 1-1: BE trả `MOD_003` — báo cáo NGƯỜI DÙNG thay thế. */
  reportConversation: (conversationId: string, name?: string) => void;
  /** Mở hộp xác nhận rồi mới chặn — không chặn ngay khi bấm. */
  blockUser: (userId: string, name?: string) => void;
  unblockUser: (userId: string, name?: string) => void;
}

/**
 * Cầu nối từ mọi feature tới `ReportSheet`/`BlockConfirmSheet` của `moderation` mà không phải
 * import nó — xem `moderation-intent.store.ts`. Các hàm trả về có tham chiếu ỔN ĐỊNH.
 *
 * ⚠️ Nếu nơi gọi đang nằm trong một `<Modal>` (`BottomSheet`), gọi `onClose()` của tấm đó
 * TRƯỚC — cùng nhịp "đóng rồi mới mở" mà `MessageActionSheet`/`MemberCardSheet` đã dùng.
 */
export function useModerationActions(): ModerationActions {
  const requestReport = useModerationIntentStore((state) => state.requestReport);
  const requestBlock = useModerationIntentStore((state) => state.requestBlock);

  return useMemo<ModerationActions>(
    () => ({
      reportMessage: (message) =>
        requestReport({ targetType: 'MESSAGE', targetId: message.id, authorId: message.authorId }),
      reportUser: (userId, name, contextWorkspaceId) =>
        requestReport({ targetType: 'USER', targetId: userId, name, contextWorkspaceId }),
      reportChannel: (channelId, name) => requestReport({ targetType: 'CHANNEL', targetId: channelId, name }),
      reportConversation: (conversationId, name) =>
        requestReport({ targetType: 'CONVERSATION', targetId: conversationId, name }),
      blockUser: (userId, name) => requestBlock({ userId, name, mode: 'block' }),
      unblockUser: (userId, name) => requestBlock({ userId, name, mode: 'unblock' }),
    }),
    [requestReport, requestBlock],
  );
}
