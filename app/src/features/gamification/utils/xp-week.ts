import { formatNumber } from '@/shared/utils/format/currency.utils';

import type { DayBucket, XpEventLike } from './xp-week.types';

/**
 * Gom sự kiện XP theo NGÀY ĐỊA PHƯƠNG của máy cho khối thống kê ở Trang chủ ("Chuỗi chăm chỉ", "Hoạt động 7 ngày").
 *
 * ── ⚠️ Vì sao ngày địa phương và vì sao không trừ 86_400_000 ms ─────────────────────────────────────────────
 * `occurredAt` là ISO UTC. Cắt 10 ký tự đầu (`slice(0, 10)`) ra NGÀY UTC: việc làm lúc 06:00 sáng giờ Việt Nam
 * (23:00 UTC hôm trước) rơi vào cột của hôm qua. Nên đổi sang `Date` rồi đọc `getFullYear/getMonth/getDate` (giờ
 * máy). Lùi ngày bằng `new Date(y, m, d - n)` chứ không phải `now - n × 86_400_000`: ngày chuyển giờ mùa hè dài 23
 * hoặc 25 giờ, trừ mili-giây thì lệch một ngày quanh mốc đó. (BE tính chuỗi theo múi giờ hồ sơ; máy và hồ sơ hiếm
 * khi khác nhau, và `markStreakRun` chỉ BÙ thêm chứ không xoá ngày nào.)
 */

/** Số ngày của cửa sổ thống kê: hôm nay + 6 ngày trước. */
export const WEEK_DAYS = 7;

/** Chỉ số theo `Date.getDay()` (0 = Chủ nhật). */
const WEEKDAY_LABELS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'] as const;

const pad = (value: number): string => String(value).padStart(2, '0');

/** `YYYY-MM-DD` theo giờ ĐỊA PHƯƠNG của máy — khoá gom ngày. */
export function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** 00:00 địa phương của NGÀY ĐẦU cửa sổ (`days - 1` ngày trước hôm nay). */
export function weekWindowStart(now: Date, days: number = WEEK_DAYS): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - (days - 1));
}

/**
 * `ADMIN_ADJUST` là quản trị viên chỉnh điểm (có thể ÂM), không phải việc người dùng đã làm — không tính vào hoạt
 * động hay tổng XP của tuần.
 */
function isUserActivity(event: XpEventLike): boolean {
  return event.sourceType !== 'ADMIN_ADJUST';
}

/**
 * Gom sự kiện theo ngày địa phương: `{ xp, events }` mỗi ngày CÓ hoạt động (ngày trống không có mặt trong Map).
 * Sự kiện đã chạm trần (`xp = 0`, `capped`) VẪN là hoạt động — BE cũng tính chuỗi cho chúng — nên đếm vào `events`.
 */
export function groupXpByDay(
  events: readonly XpEventLike[],
): Map<string, { events: number; xp: number }> {
  const byDay = new Map<string, { events: number; xp: number }>();
  for (const event of events) {
    if (!isUserActivity(event)) continue;
    const at = new Date(event.occurredAt);
    if (Number.isNaN(at.getTime())) continue;
    const key = localDateKey(at);
    const current = byDay.get(key) ?? { events: 0, xp: 0 };
    byDay.set(key, { events: current.events + 1, xp: current.xp + Math.max(0, event.xp) });
  }
  return byDay;
}

/**
 * 7 ngày gần nhất, CŨ → MỚI (hôm nay ở cuối), luôn đủ `days` phần tử — ngày không có sự kiện vẫn có mặt với `xp = 0`
 * (biểu đồ cần cột trống chứ không phải thiếu cột). Sự kiện ngoài cửa sổ bị bỏ qua.
 */
export function last7Days(
  events: readonly XpEventLike[],
  now: Date = new Date(),
  days: number = WEEK_DAYS,
): DayBucket[] {
  const byDay = groupXpByDay(events);
  const todayKey = localDateKey(now);
  return Array.from({ length: days }, (_unused, index) => {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (days - 1 - index));
    const key = localDateKey(date);
    const stat = byDay.get(key);
    return {
      active: stat !== undefined,
      dateKey: key,
      dateLabel: `${pad(date.getDate())}/${pad(date.getMonth() + 1)}`,
      events: stat?.events ?? 0,
      isToday: key === todayKey,
      weekday: WEEKDAY_LABELS[date.getDay()] ?? '',
      xp: stat?.xp ?? 0,
    };
  });
}

/**
 * Bù `active` cho các ngày nằm trong CHUỖI hiện tại. Server đã tính `streak` (0 nếu gãy) và `streakAtRisk` (hôm nay
 * chưa hoạt động ⇒ chuỗi kết thúc ở HÔM QUA) — nên dải chấm không phụ thuộc việc tải đủ trang sự kiện: người ôn hàng
 * trăm thẻ mỗi ngày có thể vượt số trang ta chịu tải, nhưng chuỗi của họ vẫn đúng. Chỉ BẬT thêm, không tắt ngày nào.
 */
export function markStreakRun(
  days: readonly DayBucket[],
  profile: { streak: number; streakAtRisk: boolean },
): DayBucket[] {
  if (profile.streak <= 0) return [...days];
  const last = profile.streakAtRisk ? days.length - 2 : days.length - 1;
  const first = last - profile.streak + 1;
  return days.map((day, index) => (index >= first && index <= last ? { ...day, active: true } : day));
}

/** Tổng XP của các ngày trong cửa sổ. */
export function weekXpTotal(days: readonly DayBucket[]): number {
  return days.reduce((sum, day) => sum + day.xp, 0);
}

/**
 * Số gọn cho nhãn trên cột (cột chỉ rộng ~40dp): dưới 1.000 giữ nguyên, từ 1.000 thành "1,2k".
 * ⛔ Không `toLocaleString`/`Intl` (Hermes: ICU khác nhau giữa Android và iOS) — dùng `formatNumber` và dấu phẩy cố định.
 */
export function formatXpCompact(xp: number): string {
  if (xp < 1000) return formatNumber(xp);
  const thousands = Math.round(xp / 100) / 10;
  return `${String(thousands).replace('.', ',')}k`;
}
