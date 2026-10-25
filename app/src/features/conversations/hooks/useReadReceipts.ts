import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { SocketEvent, useSocketEvent } from '@/core/socket';

import { conversationsService } from '../api/conversations.service';
import { conversationKeys } from '../api/conversations.keys';
import type { ConversationDetail } from '../api/conversations.types';
import type { ReadReceiptEvent } from '../cache/conversation-socket-events.types';

/**
 * `read:receipt` (be.md §5.8/§6, app.md §4.2) — CHỈ đọc trạng thái server đã
 * có, KHÔNG tự ghi read marker: `PATCH .../me`/ghi `lastReadSeq` là việc của
 * p1-07 (be.md README phân công rõ `POST /read-markers` cho p1-07). Nghĩa là
 * `lastReadSeq` của CHÍNH người xem sẽ không tự tăng khi cuộn màn này cho tới
 * khi p1-07 build xong — ĐÚNG NHƯ MONG ĐỢI ở P0, không phải lỗi thiếu sót.
 *
 * Trả về "phiên bản" tăng dần mỗi khi có receipt mới cho hội thoại này — nơi
 * gọi (`SeenAvatars`) dùng làm phần của queryKey để BUỘC `readReceipts()` gọi
 * lại, thay vì tự merge state phức tạp phía client.
 */
export function useReadReceipts(conversationId: string): number {
  const queryClient = useQueryClient();
  const [version, setVersion] = useState(0);

  useSocketEvent<ReadReceiptEvent>(SocketEvent.READ_RECEIPT, (payload) => {
    if (payload.conversationId !== conversationId) return;
    setVersion((v) => v + 1);

    const detail = queryClient.getQueryData<ConversationDetail>(conversationKeys.detail(conversationId));
    if (detail?.kind === 'DIRECT' && detail.peer?.userId === payload.userId) {
      queryClient.setQueryData<ConversationDetail>(conversationKeys.detail(conversationId), {
        ...detail,
        peerLastReadSeq: payload.lastReadSeq,
        peerReadAt: payload.readAt,
      });
    }
  });

  return version;
}

/** Ai đã đọc tới `seq` — `SeenAvatars`/`WhoReadSheet` (GROUP). `liveVersion` ép gọi lại khi có `read:receipt` mới. */
export function useMessageReadReceipts(conversationId: string, seq: number, liveVersion: number) {
  return useQuery({
    queryKey: [...conversationKeys.receipts(conversationId, seq), liveVersion],
    queryFn: () => conversationsService.readReceipts(conversationId, seq),
    enabled: Boolean(conversationId) && seq > 0,
    staleTime: 5_000,
  });
}
