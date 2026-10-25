/** Đường dẫn endpoint của `threads` (be.md p1-06 §4) — `grep` một lần là thấy hết mặt tiếp xúc backend. */
export const THREADS_API = {
  /** Tin gốc + tóm tắt luồng + trang reply (`root`, `thread`, `replies`). */
  byRoot: (rootMessageId: string) => `/messages/${rootMessageId}/thread`,
  /** `PUT { state: 'EXPLICIT_ON' | 'EXPLICIT_OFF' }` — `:id` là `Thread.id`, KHÔNG phải id tin gốc. */
  subscription: (threadId: string) => `/threads/${threadId}/subscription`,
  /** `GET ?filter=following|all&cursor=&limit=` — danh sách luồng của kênh, cursor theo `(lastReplyAt, id)` mới nhất trước. */
  channelThreads: (channelId: string) => `/channels/${channelId}/threads`,
  channel: (channelId: string) => `/channels/${channelId}`,
  /** Danh bạ tên/ảnh cho `resolveAuthor` — `GET /channels/:id/members?page=&limit=`. */
  channelMembers: (channelId: string) => `/channels/${channelId}/members`,
} as const;
