import type { ChatRow } from './buildRows';

/**
 * seq LỚN NHẤT trong các dòng đang HIỂN THỊ (`0` = không có tin đã gửi nào). Bản tạm SENDING/FAILED (chưa có seq) và
 * dòng phân cách ngày/"Tin chưa đọc" không tính — chỉ tin đã có trên server mới có thể là mốc "đã đọc".
 */
export function maxVisibleSeq(tokens: readonly { item: ChatRow | undefined }[]): number {
  let max = 0;
  for (const { item: row } of tokens) {
    if (row?.type === 'bubble' && row.item.kind === 'sent') max = Math.max(max, row.item.message.seq);
  }
  return max;
}
