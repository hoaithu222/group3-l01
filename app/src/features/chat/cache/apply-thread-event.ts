import { patchMessageById, type MessagesData } from './message-pages';
import type { ThreadUpdatedEvent } from './chat-socket-events.types';

/**
 * `thread:updated` → cập nhật tóm tắt trên TIN GỐC trong cache luồng chính của kênh (README p1-06 §4.2):
 * hàng `ThreadSummaryRow` đổi số phản hồi/người trả lời/thời điểm mà không phải tải lại trang.
 *
 * Bỏ sự kiện CŨ hơn cache — socket không đảm bảo thứ tự và REST có thể về sau: so `lastReplySeq`
 * khi cache đã có; cache chưa có (tin tải từ REST bản BE chưa ghép `lastReplySeq`) thì so
 * `replyCount`, vì số phản hồi CHỈ TĂNG (thu hồi reply KHÔNG giảm — be.md p1-06 §2).
 * Tin gốc không nằm trong cache (chưa cuộn tới trang đó) thì không làm gì: lần tải trang sau REST tự ghép đủ.
 */
export function applyThreadUpdated(
  data: MessagesData | undefined,
  payload: ThreadUpdatedEvent,
): MessagesData | undefined {
  if (!data) return data;
  return patchMessageById(data, payload.parentMessageId, (m) => {
    if (m.lastReplySeq !== undefined && payload.lastReplySeq <= m.lastReplySeq) return m;
    if (
      m.lastReplySeq === undefined &&
      m.replyCount !== undefined &&
      payload.replyCount < m.replyCount
    )
      return m;
    return {
      ...m,
      replyCount: payload.replyCount,
      lastReplyAt: payload.lastReplyAt,
      lastReplierIds: payload.lastReplierIds,
      lastReplySeq: payload.lastReplySeq,
    };
  });
}
