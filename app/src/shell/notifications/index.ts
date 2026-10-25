/**
 * Thông báo đẩy — phần nối với vòng đời app (p0-06). Logic thuần/native ở `@/core/notifications`.
 *
 *   useNotificationsBootstrap — MỘT lần ở `AppProviders`: đăng ký token, dọn khi rời phiên
 *   PushTapRouter             — MỘT lần ở `app/_layout.tsx` (`RootNavigator`): chạm thông báo → mở màn
 *   PushPrimerHost            — MỘT lần ở `app/(app)/_layout.tsx`: tấm mời bật thông báo
 *   usePushPermission         — trạng thái quyền OS + nút bật (màn Cài đặt thông báo, primer)
 *   requestPushPrimer         — xin hiện primer (p2-04 gọi khi người dùng bật nhắc họp)
 *   InAppMessageBannerHost    — MỘT lần ở `(app)/_layout`: banner tin nhắn khi app đang mở (p1-07)
 *   useReadStateSync          — MỘT lần ở `(app)/_layout`: socket → số chưa đọc + hộp thư (p1-07)
 *   useUnreadSummary / useWorkspaceUnread / useTabBadges / useAppIconBadge — số chưa đọc (p1-07)
 */
export { InAppMessageBannerHost } from './InAppMessageBannerHost';
export { PushPrimerHost } from './PushPrimerHost';
export { PushTapRouter } from './PushTapRouter';
export {
  PRIMER_SNOOZE_DAYS,
  clearPrimerRecord,
  isPrimerRoute,
  requestPushPrimer,
  shouldShowPrimer,
  snoozePrimer,
} from './push-primer';
export type { PrimerRecord } from './push-primer';
export { useNotificationsBootstrap } from './useNotificationsBootstrap';
export { usePushPermission } from './usePushPermission';
export { useAppIconBadge } from './useAppIconBadge';
export { useReadStateSync } from './useReadStateSync';
export { useTabBadges } from './useTabBadges';
export { useUnreadSummary, useWorkspaceUnread } from './useUnreadSummary';
