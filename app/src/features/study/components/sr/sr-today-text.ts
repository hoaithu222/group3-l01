import type { SrSummary } from '../../api/sr.types';

/**
 * Câu chữ của khối "Ôn tập hôm nay" — MỘT nơi cho thẻ "Hôm nay" ở Trang chủ Học (`SrDueCard`) và widget ở Trang chủ ứng dụng
 * (`HomeSrTodayWidget`), để hai nơi không kể cùng một con số bằng hai câu khác nhau.
 */

/** "5 đến hạn · 7 thẻ mới" — chỉ ghép phần có số (không hiện "0 thẻ mới"). */
export function srDueDetail({
  dueToday,
  newToday,
}: Pick<SrSummary, 'dueToday' | 'newToday'>): string {
  const parts: string[] = [];
  if (dueToday > 0) parts.push(`${dueToday} đến hạn`);
  if (newToday > 0) parts.push(`${newToday} thẻ mới`);
  return parts.join(' · ');
}

/** "Bạn đã ôn 12 thẻ · chuỗi ôn 3 ngày" */
export function srDoneDetail({
  reviewedToday,
  reviewStreakDays,
}: Pick<SrSummary, 'reviewedToday' | 'reviewStreakDays'>): string {
  const parts = [`Bạn đã ôn ${reviewedToday} thẻ`];
  if (reviewStreakDays > 0) parts.push(`chuỗi ôn ${reviewStreakDays} ngày`);
  return parts.join(' · ');
}

/**
 * Tiến độ hôm nay = đã ôn / (đã ôn + còn phải ôn), 0..1. Cả hai vế đều là số THẬT của `GET /sr/summary` (`reviewedToday` và `dueToday
 * + newToday` còn lại) — không có "mục tiêu ngày" nào do client bịa ra. ⚠️ Tổng có thể lớn hơn số thẻ RIÊNG BIỆT (thẻ chấm "Lại" vẫn còn đến hạn nên nằm ở vế còn lại, còn `reviewedToday` đếm lượt chấm), nên đây
 * là thước đo "hôm nay đã đi được bao xa", không phải cam kết "còn đúng N thẻ".
 */
export function srTodayProgress(reviewed: number, remaining: number): number {
  const total = reviewed + remaining;
  return total > 0 ? Math.min(1, reviewed / total) : 0;
}
