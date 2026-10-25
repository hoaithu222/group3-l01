import { formatDate, type DateInput } from './date.utils';

/**
 * Hạn của KHÁCH (GUEST, p3-04) — "Khách · còn 12 ngày".
 *
 * Nằm ở `shared` vì HAI feature cùng cần đúng một cách đọc hạn: `members` (dòng
 * thành viên, thẻ quản lý khách) và `workspaces` (banner ở hub của khách). Mỗi
 * bên tự tính là hai nơi lệch nhau ở ngưỡng "sắp hết hạn" — đúng lỗi mà luật
 * "không import chéo feature" ép ta tránh bằng cách đưa lên tầng chung.
 */

/**
 * Ngưỡng nhấn mạnh "sắp hết hạn" — khớp `LIMITS.guest.expiringNoticeHours`
 * (README p3-04 §7: 48 giờ, cùng ngưỡng BE gửi `GUEST_EXPIRING`). Đổi ở BE thì
 * đổi ở đây; không có endpoint nào trả ngưỡng này về client.
 */
export const GUEST_EXPIRING_HOURS = 48;

const MS_PER_HOUR = 60 * 60 * 1000;
const HOURS_PER_DAY = 24;

export interface GuestRemaining {
  /** Đã qua hạn — BE coi khách đã mất quyền NGAY (không chờ job dọn), client cũng vậy. */
  expired: boolean;
  /** Còn < 48 giờ: app.md §7 — nhấn bằng CHỮ + icon, không chỉ màu. */
  urgent: boolean;
  /** Số giờ còn lại, làm tròn LÊN (còn 1 phút vẫn là "còn 1 giờ", không phải "0 giờ"). */
  hours: number;
  /** Số ngày còn lại, làm tròn LÊN. */
  days: number;
}

/** `null` khi không có hạn (trường thiếu/không hợp lệ) — nơi gọi ẩn hẳn phần hiển thị. */
export function getGuestRemaining(
  expiresAt: DateInput,
  now: number = Date.now(),
): GuestRemaining | null {
  if (expiresAt === null || expiresAt === undefined || expiresAt === '') return null;
  const target = new Date(expiresAt).getTime();
  if (Number.isNaN(target)) return null;

  const remainingMs = target - now;
  if (remainingMs <= 0) return { expired: true, urgent: true, hours: 0, days: 0 };

  const hours = Math.ceil(remainingMs / MS_PER_HOUR);
  return {
    expired: false,
    urgent: hours <= GUEST_EXPIRING_HOURS,
    hours,
    days: Math.ceil(hours / HOURS_PER_DAY),
  };
}

/**
 * "còn 12 ngày" · "còn 30 giờ" (≤ 48 giờ đổi sang giờ cho khỏi "còn 2 ngày" khi
 * thật ra chỉ còn 25 giờ) · "đã hết hạn".
 */
export function formatGuestRemaining(remaining: GuestRemaining): string {
  if (remaining.expired) return 'đã hết hạn';
  if (remaining.urgent) return `còn ${remaining.hours} giờ`;
  return `còn ${remaining.days} ngày`;
}

/** "hết hạn 12/10/2026" — luôn kèm NGÀY cụ thể bên cạnh "còn N ngày" (app.md §7). */
export function formatGuestExpiryDate(expiresAt: DateInput): string {
  const text = formatDate(expiresAt);
  return text ? `hết hạn ${text}` : '';
}
