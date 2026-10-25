import type { FlashListRef } from '@shopify/flash-list';
import { useCallback, useState, type RefObject } from 'react';

import { useOpenAtMessage } from '../hooks/useOpenAtMessage';
import type { ChatRow } from './list/buildRows';

const HIGHLIGHT_MS = 2000;

const hasMessage = (rows: ChatRow[], id: string | undefined) =>
  id !== undefined && rows.some((r) => r.type === 'bubble' && r.item.kind === 'sent' && r.item.message.id === id);

interface JumpOptions {
  rows: ChatRow[];
  listRef: RefObject<FlashListRef<ChatRow> | null>;
  /** `useMessages().jumpTo` — mở lô `around` khi tin chưa có trong danh sách đang tải. */
  reanchor: (messageId: string) => void;
  /** `?m=` (kết quả tìm/đã lưu/ghim, deep link) — tự nhảy tới khi lô `around` đầu tiên tải xong. */
  initialMessageId: string | undefined;
}

/**
 * Nhảy tới một tin trong phòng chat: đã có trong danh sách thì cuộn giữa màn + tô nổi 2 giây; CHƯA có (tin cũ — chạm thanh ghim, trích
 * dẫn trả lời, tin ghim ngoài trang đang tải) thì mở lô `around` RỒI mới cuộn/tô nổi.
 *
 * ⛔ Bước "rồi mới cuộn" là bắt buộc: `useMessages().jumpTo` chỉ đổi mốc tải, còn `MessageList` bắt đầu ở ĐÁY lô mới (`startRenderingFromBottom`)
 * nên tin cần xem nằm giữa lô, ngoài khung nhìn — bản cũ dừng ở đó (chạm trích dẫn tới tin cũ "không thấy gì xảy ra"). `pendingId` giữ
 * mục tiêu cho tới khi hàng của nó xuất hiện (`useOpenAtMessage` chờ bố cục ổn định rồi gọi lại `jumpTo`, lần này đi nhánh cuộn).
 */
export function useJumpToMessage({ rows, listRef, reanchor, initialMessageId }: JumpOptions) {
  const [highlightId, setHighlightId] = useState<string>();
  const [pendingId, setPendingId] = useState<string>();

  const jumpTo = useCallback(
    (id: string) => {
      const row = rows.find((r) => r.type === 'bubble' && r.item.kind === 'sent' && r.item.message.id === id);
      if (row) {
        listRef.current?.scrollToItem({ animated: true, item: row, viewPosition: 0.5 });
        setHighlightId(id);
        setTimeout(() => setHighlightId(undefined), HIGHLIGHT_MS);
      } else {
        reanchor(id);
        setPendingId(id);
      }
    },
    [rows, listRef, reanchor],
  );

  useOpenAtMessage(initialMessageId, hasMessage(rows, initialMessageId), jumpTo);
  useOpenAtMessage(pendingId, hasMessage(rows, pendingId), (id) => {
    setPendingId(undefined);
    jumpTo(id);
  });

  return { highlightId, jumpTo };
}
