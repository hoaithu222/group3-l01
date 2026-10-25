/**
 * Đường dẫn module `devices` của BE (p0-06). `POST` và `GET` cùng một đường dẫn gốc.
 */
export const DEVICE_ENDPOINTS = {
  /** `POST` đăng ký/cập nhật token · `GET` danh sách thiết bị đang hoạt động. */
  ROOT: '/me/devices',
} as const;

/** `DELETE /me/devices/:deviceId` — thu hồi MỌI token (FCM + VoIP) của thiết bị đó. */
export function devicePath(deviceId: string): string {
  return `${DEVICE_ENDPOINTS.ROOT}/${encodeURIComponent(deviceId)}`;
}
