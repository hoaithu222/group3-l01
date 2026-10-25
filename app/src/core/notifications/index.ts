/**
 * Thông báo đẩy (p0-06) — phần CORE, không có UI.
 *
 *   android-channels.ts      — kênh `default` | `mentions` | `calls`
 *   permission.ts            — trạng thái quyền OS, xin quyền, mở Cài đặt
 *   device-registration.ts   — đăng ký/đổi/huỷ token với `POST|DELETE /me/devices`
 *   devices.{api,service,types}.ts — hợp đồng `/me/devices`
 *   preferences.{service,types}.ts — `GET/PUT /me/notification-preferences` (cấp tài khoản)
 *   notification.keys.ts / dnd.ts — khoá React Query, mốc "Không làm phiền"
 *   foreground-policy.ts     — ẩn/hiện banner khi app đang mở
 *   in-app-banner*.ts / play-message-sound.ts — banner tin nhắn do app tự vẽ ở foreground (p1-07)
 *   push-router.ts           — payload → đường dẫn màn hình khi chạm thông báo
 *   push-payload.types.ts    — kiểu + parse payload push
 *   notification-route.ts    — bảng `type → route` dùng chung push + hộp thư (p1-07)
 *   read-state.{types,service}.ts — `POST /read-markers`, `/me/unread*` (p1-07)
 *   inbox.{types,service}.ts — hộp thư "Hoạt động" `/notifications*` (p1-07)
 *   badge.ts / wipe-local-push-state.ts — huy hiệu, dọn khay khi đăng xuất
 *   notifications.setup.ts   — `initNotifications()` (handler + kênh)
 *
 * Phần nối với vòng đời app (hook, primer) ở `src/shell/notifications/`.
 */
export { ANDROID_CHANNEL_IDS, ANDROID_CHANNELS, ensureAndroidChannels } from './android-channels';
export type { AndroidChannelId, AndroidChannelSpec } from './android-channels';
export { setAppBadgeCount } from './badge';
export {
  getFcmToken,
  registerPushToken,
  registerRotatedToken,
  registerVoipPushToken,
  resetPushRegistration,
  unregisterThisDevice,
} from './device-registration';
export type { PushRegisterOutcome } from './device-registration';
export { devicesService } from './devices.service';
export type {
  DevicePlatform,
  DeviceSummary,
  DeviceTokenKind,
  RegisterDevicePayload,
  RegisterDeviceResult,
  UnregisterDeviceResult,
} from './devices.types';
export { computeDndUntil, DND_MORNING_HOUR } from './dnd';
export type { DndDuration } from './dnd';
export { decideForeground, toNotificationBehavior, usesInAppBanner } from './foreground-policy';
export { useInAppBannerStore } from './in-app-banner.store';
export type { InAppBanner } from './in-app-banner.store';
export { inboxService } from './inbox.service';
export type {
  InboxActor,
  InboxFilter,
  InboxItem,
  InboxItemContext,
  InboxKind,
  InboxPage,
  InboxRefs,
  InboxScopeType,
  InboxUnreadCount,
  ListInboxParams,
  NotificationCreatedEvent,
  NotificationReadEvent,
  ReadAllInboxPayload,
} from './inbox.types';
export { hrefForTarget, hrefOrActivity } from './notification-route';
export type { NotificationTarget } from './notification-route';
export { readStateService } from './read-state.service';
export type {
  ChannelUnread,
  ReadMarkerPayload,
  ReadMarkerResult,
  ReadStreamType,
  ReadUpdatedEvent,
  ThreadUnread,
  UnreadSummary,
  UnreadSummaryChangedEvent,
  WorkspaceUnread,
} from './read-state.types';
export { notificationKeys } from './notification.keys';
export type { ForegroundContext, ForegroundVerdict } from './foreground-policy';
export { initNotifications, isViewingScope } from './notifications.setup';
export {
  getPushPermission,
  openNotificationSettings,
  requestPushPermission,
  toPermissionState,
} from './permission';
export type { PushPermissionState } from './permission';
export { notificationPreferencesService } from './preferences.service';
export type {
  AccountNotificationPreference,
  AccountNotifyMode,
  LockScreenLevel,
  UpdateAccountNotificationPreferencePayload,
  UpdateWorkspaceNotificationPreferencePayload,
  WorkspaceNotificationPreference,
  WorkspaceNotifyMode,
} from './preferences.types';
export { extractPushData, parsePushPayload, PUSH_TYPES } from './push-payload.types';
export type { PushPayload, PushType } from './push-payload.types';
export { decidePushTap, resolvePushHref } from './push-router';
export type { PushTapOutcome } from './push-router';
export { wipeLocalPushState } from './wipe-local-push-state';
