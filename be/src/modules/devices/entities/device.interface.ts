export const DEVICE_PLATFORMS = ["ANDROID", "IOS", "WEB"] as const;
export type DevicePlatform = (typeof DEVICE_PLATFORMS)[number];

export const DEVICE_TOKEN_KINDS = ["FCM", "APNS_VOIP"] as const;
export type DeviceTokenKind = (typeof DEVICE_TOKEN_KINDS)[number];

export const APNS_ENVIRONMENTS = ["SANDBOX", "PRODUCTION"] as const;
export type ApnsEnvironmentValue = (typeof APNS_ENVIRONMENTS)[number];

export interface DeviceToken {
  id: string;
  userId: string;
  deviceId: string;
  platform: DevicePlatform;
  kind: DeviceTokenKind;
  token: string;
  bundleId: string | null;
  environment: ApnsEnvironmentValue | null;
  appVersion: string | null;
  locale: string | null;
  failureCount: number;
  lastSeenAt: Date;
  revokedAt: Date | null;
  revokeReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface RegisterDeviceInput {
  userId: string;
  deviceId: string;
  platform: DevicePlatform;
  kind: DeviceTokenKind;
  token: string;
  bundleId?: string;
  environment?: ApnsEnvironmentValue;
  appVersion?: string;
  locale?: string;
}

/** Kết quả `register()` — theo be.md §4 response `POST /me/devices`. */
export interface RegisterDeviceResult {
  id: string;
  deviceId: string;
  kind: DeviceTokenKind;
  platform: DevicePlatform;
}

/** 1 dòng trong `GET /me/devices` — hợp nhất theo `deviceId` (1 thiết bị có thể có nhiều `kind`). */
export interface ActiveDeviceSummary {
  deviceId: string;
  platform: DevicePlatform;
  kinds: DeviceTokenKind[];
  appVersion: string | null;
  lastSeenAt: Date;
  current: boolean;
}

/** Lý do thu hồi token — chỉ dùng chuỗi cố định, KHÔNG tự do (dễ audit/debug). */
export const REVOKE_REASONS = [
  "TOKEN_ROTATED",
  "DEVICE_LIMIT",
  "LOGOUT",
  "FCM_UNREGISTERED",
  "APNS_UNREGISTERED",
  "STALE",
  "ADMIN",
] as const;
export type RevokeReason = (typeof REVOKE_REASONS)[number];
