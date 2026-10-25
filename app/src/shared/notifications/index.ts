/**
 * Lớp dùng chung của "đã đọc / chưa đọc / chế độ thông báo" (p1-07) — nằm ở `shared/` vì `chat`, `conversations`,
 * `threads` (và `channels`, `workspaces`) đều cần mà KHÔNG được import chéo feature (`docs/rules/feature-structure.md`).
 * Cùng tiền lệ `shared/saved`. Dịch vụ HTTP ở `@/core/notifications`; hook gắn với phiên/socket ở `@/shell/notifications`.
 */
export {
  BADGE_MAX_DISPLAY,
  INBOX_INVALIDATE_DEBOUNCE_MS,
  READ_MARKER_DEBOUNCE_MS,
  SUMMARY_INVALIDATE_DEBOUNCE_MS,
  SUMMARY_REFRESH_AFTER_READ_MS,
} from './notifications.constants';
export {
  accountModeFromChoice,
  channelModeFromChoice,
  choiceFromAccountMode,
  choiceFromChannelMode,
  effectiveChoice,
  inheritLabel,
  MUTE_DURATIONS,
  mutedUntilFromHours,
  NOTIFY_CHOICE_LABEL,
} from './notify-mode';
export type { ChannelNotifyMode, NotifyChoice } from './notify-mode';
export { NotifyModeSheet } from './NotifyModeSheet';
export type { NotifyModeSheetProps } from './NotifyModeSheet';
export {
  applyChannelMessage,
  applyChannelRead,
  applyThreadRead,
  bumpActivity,
  countUnreadIn,
  dropActivity,
  markInboxBefore,
  markInboxItemsRead,
} from './unread.cache';
export { useInheritedNotifyChoice } from './useInheritedNotifyChoice';
export type { InheritedKind } from './useInheritedNotifyChoice';
export { useReadMarker } from './useReadMarker';
export type { UseReadMarkerOptions } from './useReadMarker';
export { useThreadUnread } from './useThreadUnread';
export { useWorkspaceNotifyPreference } from './useWorkspaceNotifyPreference';
