/**
 * Ngày theo MÚI GIỜ cho `WorkspaceDailyStat.date` ("YYYY-MM-DD") — README p1-01
 * §7/be.md §7: cron `workspace.stats-daily` chạy 01:10 theo `env.CRON_TZ`
 * (mặc định `Asia/Ho_Chi_Minh`), nên "một ngày" PHẢI tính theo cùng múi giờ đó
 * (không phải UTC — 01:10 ICT là 18:10 UTC hôm trước, key UTC sẽ lệch 1 ngày).
 * Hàm thuần, không phụ thuộc DB — dùng `Intl` (đã kèm ICU đầy đủ trong Node ≥ 13),
 * đúng cả khi múi giờ có DST (ngày 23/25 giờ).
 */

const DAY_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isDayKey(value: unknown): value is string {
  if (typeof value !== "string" || !DAY_KEY_RE.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/** Các thành phần lịch của `instant` khi nhìn từ múi giờ `tz`. */
function zonedParts(instant: number, tz: string): { y: number; m: number; d: number; h: number; mi: number; s: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(instant));
  const get = (type: string): number => Number(parts.find((p) => p.type === type)?.value);
  return { y: get("year"), m: get("month"), d: get("day"), h: get("hour"), mi: get("minute"), s: get("second") };
}

/** Độ lệch (ms) của `tz` so với UTC tại `instant` — dương khi múi giờ đi trước UTC (vd ICT = +7h). */
function offsetMs(instant: number, tz: string): number {
  const p = zonedParts(instant, tz);
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - Math.floor(instant / 1000) * 1000;
}

/** "YYYY-MM-DD" của `instant` theo múi giờ `tz`. */
export function dayKeyInTz(instant: Date, tz: string): string {
  const { y, m, d } = zonedParts(instant.getTime(), tz);
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Cộng/trừ `days` ngày lịch cho 1 day key (không phụ thuộc múi giờ). */
export function addDaysToKey(dayKey: string, days: number): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Thời điểm UTC của 00:00 ngày `dayKey` theo múi giờ `tz` (xử lý DST bằng 1 lần hiệu chỉnh). */
export function startOfDayUtc(dayKey: string, tz: string): Date {
  const [y, m, d] = dayKey.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d);
  const first = guess - offsetMs(guess, tz);
  return new Date(guess - offsetMs(first, tz));
}

/** Khoảng `[from, to)` (UTC) của ngày `dayKey` theo `tz` — `to` là 00:00 ngày kế tiếp. */
export function dayRangeUtc(dayKey: string, tz: string): { from: Date; to: Date } {
  return { from: startOfDayUtc(dayKey, tz), to: startOfDayUtc(addDaysToKey(dayKey, 1), tz) };
}

/** Ngày ĐÃ KẾT THÚC gần nhất theo `tz` (hôm qua) — ngày mà job 01:10 tổng kết. */
export function previousDayKey(now: Date, tz: string): string {
  return addDaysToKey(dayKeyInTz(now, tz), -1);
}
