import { formatDate } from '@/shared/utils/format/date.utils';
import { getGuestRemaining } from '@/shared/utils/format/guest-expiry.utils';

/** "Cần 2 · Đã có 1" (app.md §3 thẻ bảng tin). */
export function mentorsNeededText(needed: number, active: number): string {
  return `Cần ${needed} · Đã có ${active}`;
}

/** "Còn 12 ngày" / "Còn 5 giờ" / "Đã hết hạn" — đọc hạn bằng CÙNG hàm với hạn khách (`guest-expiry.utils`). */
export function remainingText(endsAt: string, now: number): string {
  const r = getGuestRemaining(endsAt, now);
  if (!r) return '';
  if (r.expired) return 'Đã hết hạn';
  return r.days >= 2 ? `Còn ${r.days} ngày` : `Còn ${r.hours} giờ`;
}

/** Hạn bài: "Hạn 30/10/2026". */
export function deadlineText(expiresAt: string): string {
  return `Hạn ${formatDate(expiresAt)}`;
}

/** Tạo khoá `Idempotency-Key` một lần cho mỗi lượt mở form (bấm gửi 2 lần chỉ tạo 1 bản ghi). */
export function newIdempotencyKey(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
