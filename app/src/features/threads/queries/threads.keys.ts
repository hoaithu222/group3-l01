import type { ThreadListFilter } from '../api';

/** Khoá query của `threads` (app.md p1-06 §4.1) — mọi tham số ảnh hưởng kết quả đều nằm trong khoá. */
export const threadKeys = {
  all: ['threads'] as const,
  /** Tin gốc + tóm tắt luồng + `mySubscription` (`GET /messages/:id/thread`). */
  byRoot: (rootId: string) => [...threadKeys.all, 'root', rootId] as const,
  /** Tiền tố mọi bộ lọc của danh sách luồng MỘT kênh — để `invalidate` khi có phản hồi mới/đổi theo dõi. */
  lists: (channelId: string) => [...threadKeys.all, 'list', channelId] as const,
  /** Danh sách luồng của kênh theo bộ lọc (Đang theo dõi / Tất cả). */
  list: (channelId: string, filter: ThreadListFilter) => [...threadKeys.lists(channelId), filter] as const,
  /** Danh bạ tên/ảnh của kênh (nhiều trang) cho `resolveAuthor`. */
  authors: (channelId: string) => [...threadKeys.all, 'authors', channelId] as const,
  /** Tên + quyền gửi của kênh chứa luồng. */
  channel: (channelId: string) => [...threadKeys.all, 'channel', channelId] as const,
};
