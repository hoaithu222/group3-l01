import dayjs from 'dayjs';

import { GUEST_EXPIRING_SOON_HOURS } from '../constants/workspace-access.constants';

/**
 * Che email theo dạng `l***@gmail.com` (ký tự đầu + `***` + phần tên miền). Idempotent: email BE đã che
 * (có `*`) giữ nguyên; chuỗi không phải email → che hết (`***`). Lớp phòng thủ thứ hai — BE mới là nơi
 * phải che (admin.md p3-04 §3), client chỉ đảm bảo lỡ nhận email đầy đủ cũng không in ra.
 */
export function maskEmail(email: string): string {
  if (email.includes('*')) return email;
  const at = email.lastIndexOf('@');
  if (at <= 0) return '***';
  return `${email[0]}***${email.slice(at)}`;
}

export type GuestExpiryState = 'expired' | 'soon' | 'ok';

/**
 * Trạng thái hạn của khách: `expired` (đã quá hạn nhưng chưa được quét thu hồi), `soon` (còn
 * ≤ `GUEST_EXPIRING_SOON_HOURS` giờ), `ok`. `now` truyền vào để test tất định.
 */
export function guestExpiryState(expiresAt: string, now: Date = new Date()): GuestExpiryState {
  const hoursLeft = dayjs(expiresAt).diff(dayjs(now), 'hour', true);
  if (hoursLeft <= 0) return 'expired';
  return hoursLeft <= GUEST_EXPIRING_SOON_HOURS ? 'soon' : 'ok';
}
