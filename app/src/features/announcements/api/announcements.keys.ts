import type { ReceiptStatus } from './announcements.types';

/**
 * Khoá cache của `announcements`. Danh sách theo KÊNH là nguồn duy nhất của huy hiệu trên tin (mỗi tin không gọi API riêng —
 * tránh N+1); danh sách xác nhận tách theo `status` vì hai tab là hai danh sách khác nhau.
 */
export const announcementKeys = {
  all: ['announcements'] as const,
  channel: (channelId: string) => ['announcements', 'channel', channelId] as const,
  /** Tiền tố của cả hai tab — để `invalidate`/vá số đếm mọi tab cùng lúc. */
  receiptsOf: (messageId: string) => ['announcements', 'receipts', messageId] as const,
  receipts: (messageId: string, status: ReceiptStatus) =>
    ['announcements', 'receipts', messageId, status] as const,
};
