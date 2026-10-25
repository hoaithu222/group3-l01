import type { DeviceToken, DeviceTokenKind, RegisterDeviceInput, RevokeReason } from "../entities/device.interface";

export interface ActiveDeviceRow {
  deviceId: string;
  lastSeenAt: Date;
}

export interface IDeviceRepository {
  findByToken(token: string): Promise<DeviceToken | null>;
  /** Tạo mới hoặc cập nhật bản ghi hiện có theo `token` (unique) — reassign userId khi máy đổi tài khoản (be.md §5.1). */
  upsertByToken(input: RegisterDeviceInput): Promise<DeviceToken>;
  /** Revoke mọi token KHÁC token vừa đăng ký cùng (userId, deviceId, kind) — xoay token (be.md §5.1 bước 2). */
  revokeOtherTokensForDevice(
    userId: string,
    deviceId: string,
    kind: DeviceTokenKind,
    excludeToken: string,
    reason: RevokeReason
  ): Promise<void>;
  /** Danh sách `deviceId` distinct đang hoạt động (revokedAt null) của user, kèm `lastSeenAt` mới nhất — dùng để tìm thiết bị cũ nhất khi vượt giới hạn. */
  listActiveDeviceIds(userId: string): Promise<ActiveDeviceRow[]>;
  /** Revoke toàn bộ token (mọi kind) của 1 `deviceId` — dùng cho giới hạn thiết bị + logout. */
  revokeByDeviceId(userId: string, deviceId: string, reason: RevokeReason): Promise<number>;
  /** Toàn bộ token đang hoạt động của user — cho `GET /me/devices`. */
  listActive(userId: string): Promise<DeviceToken[]>;
  /** Token hoạt động theo `kind` — dùng gửi push (FCM) / VoIP. */
  getActiveTokensByKind(userId: string, kind: DeviceTokenKind): Promise<DeviceToken[]>;
  hasActiveToken(userId: string): Promise<boolean>;
  /** Revoke theo danh sách token thật (vd FCM báo token chết) — trả số bản ghi đã revoke. */
  revokeByTokens(tokens: string[], reason: RevokeReason): Promise<number>;
  touch(userId: string, deviceId: string): Promise<void>;
  /** Xoá cứng token đã revoke quá `olderThan` — `push.token-cleanup` (be.md §5.7). */
  purgeRevokedBefore(olderThan: Date): Promise<number>;
  /** Revoke token còn hoạt động nhưng `lastSeenAt` quá cũ (thiết bị không còn dùng app). */
  revokeStaleBefore(olderThan: Date, reason: RevokeReason): Promise<number>;
}
