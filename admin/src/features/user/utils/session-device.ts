import type { UserSession } from '../types/user.types';

const MASK_PREFIX = '••••';
const VISIBLE_TAIL = 6;

/**
 * Che mã thiết bị đúng quy ước của BE (`maskDeviceId` ở `UserService`): "••••" + 6 ký tự cuối
 * (mã ≤ 6 ký tự thì giữ nguyên phần đuôi). Hai bên cùng một quy ước để hàng của phiên và hàng của
 * đăng nhập sinh trắc học (`deviceIdMasked`) trông giống nhau.
 */
export function maskDeviceId(deviceId: string): string {
  return `${MASK_PREFIX}${deviceId.length <= VISIBLE_TAIL ? deviceId : deviceId.slice(-VISIBLE_TAIL)}`;
}

/**
 * Mã thiết bị của một phiên để HIỆN trên UI. Ưu tiên bản BE đã che (`deviceIdMasked` — quản trị viên
 * xem hộ người khác); chỉ có bản đầy đủ (xem phiên của chính mình) thì che lại ở client.
 * `null` = không có gì để hiện (phiên cũ chưa ghi mã thiết bị).
 *
 * ⛔ Đây là CỔNG DUY NHẤT từ `deviceId` ra DOM — không render `session.deviceId` trực tiếp.
 */
export function sessionDeviceLabel(
  session: Pick<UserSession, 'deviceIdMasked' | 'deviceId'>,
): string | null {
  const masked = session.deviceIdMasked?.trim();
  if (masked) return masked;
  const full = session.deviceId?.trim();
  return full ? maskDeviceId(full) : null;
}
