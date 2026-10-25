/** Giờ Việt Nam (ICT = UTC+7, không có giờ mùa hè) — tiện ích thời gian cho dữ liệu hẹn giờ/thông báo. */
const ICT_MS = 7 * 3_600_000;
const DAY = 86_400_000;
const WEEKDAYS = ["Chủ nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"] as const;
const WEEKDAYS_SHORT = ["CN", "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7"] as const;

/** Thời điểm `hour:minute` giờ Việt Nam của ngày (hôm nay theo giờ VN + `days`). */
export function atIct(now: Date, days: number, hour: number, minute = 0): Date {
  const vn = new Date(now.getTime() + ICT_MS);
  const startOfDayUtc = Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth(), vn.getUTCDate()) - ICT_MS;
  return new Date(startOfDayUtc + days * DAY + (hour * 60 + minute) * 60_000);
}

/** Thứ trong tuần (0 = Chủ nhật … 6 = Thứ Bảy) của một thời điểm, theo giờ Việt Nam. */
export function weekdayOf(date: Date): number {
  return new Date(date.getTime() + ICT_MS).getUTCDay();
}

/** Số ngày từ hôm nay (giờ VN) tới lần tới của thứ `weekday` (0–6): luôn từ 1 đến 7 — không tính hôm nay. */
export function daysUntilNext(now: Date, weekday: number): number {
  const diff = (weekday - weekdayOf(now) + 7) % 7;
  return diff === 0 ? 7 : diff;
}

/** "Thứ Sáu 09/10" cho ngày (hôm nay + `days`) theo giờ Việt Nam. */
export function dayLabel(now: Date, days: number): string {
  const d = atIct(now, days, 12);
  const vn = new Date(d.getTime() + ICT_MS);
  return `${WEEKDAYS[vn.getUTCDay()]} ${String(vn.getUTCDate()).padStart(2, "0")}/${String(vn.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** "Thứ 6" (dạng ngắn, như người Việt gõ) cho ngày (hôm nay + `days`). */
export function shortDay(now: Date, days: number): string {
  return WEEKDAYS_SHORT[weekdayOf(atIct(now, days, 12))];
}

/** Bộ định dạng ngày gắn với `now` để viết nội dung có ngày thật: `d.next(5)` = số ngày tới Thứ Sáu kế tiếp, `d.label(n)` = "Thứ Sáu 09/10". */
export function dateKit(now: Date) {
  return {
    next: (weekday: number) => daysUntilNext(now, weekday),
    label: (days: number) => dayLabel(now, days),
    short: (days: number) => shortDay(now, days),
    /** Nhãn của thứ `weekday` kế tiếp (vd Thứ Sáu tuần này/tuần sau). */
    nextLabel: (weekday: number) => dayLabel(now, daysUntilNext(now, weekday)),
  };
}
export type DateKit = ReturnType<typeof dateKit>;
