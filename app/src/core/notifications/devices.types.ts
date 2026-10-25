/**
 * Kiểu DTO của `POST/GET/DELETE /me/devices` (p0-06 `be.md` §3-§4, đối chiếu
 * `be/src/modules/devices/{dtos,entities}`). BE là nguồn hợp đồng — sửa theo BE, không sửa một phía.
 */

export type DevicePlatform = 'ANDROID' | 'IOS' | 'WEB';

/** `FCM` — token FCM (push thường). `APNS_VOIP` — PushKit (iOS, chỉ đăng ký ở p2-02). */
export type DeviceTokenKind = 'APNS_VOIP' | 'FCM';

export interface RegisterDevicePayload {
  appVersion?: string;
  /** Chỉ APNs. */
  bundleId?: string;
  /** 8-64 ký tự — dùng `getDeviceId()` (cùng giá trị với header `X-Device-Id`). */
  deviceId: string;
  /** Bắt buộc khi `kind = 'APNS_VOIP'` (BE `refine`). */
  environment?: 'PRODUCTION' | 'SANDBOX';
  kind: DeviceTokenKind;
  locale?: string;
  platform: DevicePlatform;
  /** 20-4096 ký tự. */
  token: string;
}

/** 201 — BE upsert theo `token` (đổi tài khoản trên cùng máy thì chuyển `userId`, NT-07). */
export interface RegisterDeviceResult {
  deviceId: string;
  id: string;
  kind: DeviceTokenKind;
  platform: DevicePlatform;
}

/** Một dòng `GET /me/devices` — BE gộp theo `deviceId` (một máy có thể có cả `FCM` lẫn `APNS_VOIP`). */
export interface DeviceSummary {
  appVersion: string | null;
  /** `true` = thiết bị đang gọi (BE so header `X-Device-Id`) — nhãn "Thiết bị này". */
  current: boolean;
  deviceId: string;
  kinds: DeviceTokenKind[];
  /** ISO 8601. */
  lastSeenAt: string;
  platform: DevicePlatform;
}

export interface UnregisterDeviceResult {
  /** Số token đã thu hồi — `0` nếu thiết bị không còn bản ghi hoạt động (idempotent, không lỗi). */
  revoked: number;
}
