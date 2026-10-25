import type { InboxFilter } from './inbox.types';

/**
 * Khoá React Query của thông báo (p0-06 `app.md` §4 "Query keys") và của p1-07 (`app.md` §4.1: `['unread', …]`,
 * `['inbox', …]`). Một nơi biết hết khoá để làm mới/xoá đúng — logout dọn cả `unread`/`inbox`/`prefs` (NT-07).
 */
export const notificationKeys = {
  all: ['notifications'] as const,
  /** Danh sách thiết bị nhận thông báo (`GET /me/devices`). */
  devices: ['me', 'devices'] as const,
  /** Tuỳ chọn cấp tài khoản (`GET /me/notification-preferences`). */
  prefs: ['notifications', 'preferences', 'ACCOUNT'] as const,
  /** Tuỳ chọn cấp nhóm làm việc (`GET /workspaces/:id/notification-preferences`). */
  workspacePrefs: (workspaceId: string) =>
    ['notifications', 'preferences', 'WORKSPACE', workspaceId] as const,

  /** Tổng hợp chưa đọc (`GET /me/unread/summary`) — huy hiệu tab + icon app. */
  unreadSummary: ['unread', 'summary'] as const,
  /** Tiền tố mọi số chưa đọc theo workspace — để `invalidate` hàng loạt. */
  workspaceUnreadAll: ['unread', 'workspace'] as const,
  workspaceUnread: (workspaceId: string) => ['unread', 'workspace', workspaceId] as const,

  /** Tiền tố hộp thư — `invalidate`/`setQueriesData` mọi bộ lọc cùng lúc. */
  inboxAll: ['inbox'] as const,
  inboxList: (filter: { filter: InboxFilter; workspaceId?: string }) =>
    ['inbox', 'list', filter] as const,
  inboxUnreadCount: (workspaceId?: string) =>
    ['inbox', 'unread-count', workspaceId ?? null] as const,
};
