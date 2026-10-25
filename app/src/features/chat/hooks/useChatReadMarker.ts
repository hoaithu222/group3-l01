import { useReadMarker, type UseReadMarkerOptions } from '@/shared/notifications';

import type { ChatScopeRef } from '../api/chat.types';

/** Phần của "đã đọc" mà MÀN CHA biết (chat không biết cache hội thoại/kênh): mốc đã đọc lúc mở + việc vá cache sau khi đặt mốc. */
export type ChatReadOptions = Pick<UseReadMarkerOptions, 'knownLastReadSeq' | 'onMarked'>;

/**
 * p1-07 (`app.md` §4.2): "đã đọc" CHỈ khi tin thực sự HIỂN THỊ (viewability của `MessageList`), màn focus và app foreground.
 * Luồng: mốc theo luồng, gửi id TIN GỐC (BE chuẩn hoá về `Thread.id`) — NT-02: mở luồng không đẩy mốc của kênh.
 */
export function useChatReadMarker(scope: ChatScopeRef, read: ChatReadOptions | undefined) {
  return useReadMarker({
    knownLastReadSeq: read?.knownLastReadSeq,
    onMarked: read?.onMarked,
    streamId: scope.threadId ?? scope.scopeId,
    streamType: scope.threadId ? 'THREAD' : scope.scopeType,
  });
}
