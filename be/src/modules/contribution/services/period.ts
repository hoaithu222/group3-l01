import { AppError } from "../../../core/exceptions";
import { HttpStatusCode } from "../../../core/constants/http-status";
import { ErrorCode, ErrorMessages } from "../../../core/utils/error.codes";
import { addDaysToLocalDate, localDate, startOfLocalDateKey } from "../../../core/utils/local-date";

/**
 * Kỳ báo cáo (p4-06 README §2 "Kỳ", be.md §5.2) — HÀM THUẦN, mọi ranh giới theo múi giờ `tz`:
 *  - `ALL` → `(−∞, +∞)`;
 *  - `M:yyyy-mm` → đầu tháng tới đầu tháng sau;
 *  - `W:gggg-Www` (tuần ISO 8601) → thứ Hai 00:00 tới thứ Hai kế tiếp.
 * Thẻ thuộc kỳ theo `completedAt`, lượt chấm theo `submittedAt`. Khoảng nửa mở `[from, to)`.
 */
export type PeriodKind = "ALL" | "MONTH" | "WEEK";

export interface Period {
  key: string;
  kind: PeriodKind;
  /** `null` = không chặn dưới. */
  from: Date | null;
  /** `null` = không chặn trên. */
  to: Date | null;
}

export const PERIOD_ALL = "ALL";
export const PERIOD_KEY_RE = /^(ALL|M:\d{4}-(0[1-9]|1[0-2])|W:\d{4}-W(0[1-9]|[1-4]\d|5[0-3]))$/;

const DAY_MS = 86_400_000;
const pad = (n: number, width = 2): string => String(n).padStart(width, "0");

export function invalidPeriodError(key: string): AppError {
  return new AppError(ErrorMessages[ErrorCode.CONTRIB_003], HttpStatusCode.BAD_REQUEST, ErrorCode.CONTRIB_003, { period: key });
}

/** Thứ (0 = thứ Hai … 6 = Chủ nhật) của ngày lịch `y-m-d`. */
function isoWeekday(y: number, m: number, d: number): number {
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

/** Năm + số tuần ISO của một ngày lịch `YYYY-MM-DD` (tuần thuộc năm chứa ngày thứ Năm của nó). */
export function isoWeekOfDayKey(dayKey: string): { year: number; week: number } {
  const [y, m, d] = dayKey.split("-").map(Number);
  const thursday = Date.UTC(y, m - 1, d) + (3 - isoWeekday(y, m, d)) * DAY_MS;
  const year = new Date(thursday).getUTCFullYear();
  const week = Math.floor((thursday - Date.UTC(year, 0, 1)) / DAY_MS / 7) + 1;
  return { year, week };
}

/** Số tuần ISO của năm (52 hoặc 53) — 28/12 luôn thuộc tuần cuối. */
export function isoWeeksInYear(year: number): number {
  return isoWeekOfDayKey(`${pad(year, 4)}-12-28`).week;
}

/** Ngày thứ Hai (`YYYY-MM-DD`) của tuần ISO `week` năm `year` — tuần 1 là tuần chứa 04/01. */
export function isoWeekStartDayKey(year: number, week: number): string {
  const jan4Weekday = isoWeekday(year, 1, 4);
  const monday = new Date(Date.UTC(year, 0, 4 - jan4Weekday + (week - 1) * 7));
  return `${pad(monday.getUTCFullYear(), 4)}-${pad(monday.getUTCMonth() + 1)}-${pad(monday.getUTCDate())}`;
}

/** Khoá tháng `M:yyyy-mm` của `instant` theo `tz`. */
export function monthKeyOf(instant: Date, tz: string): string {
  return `M:${localDate(instant, tz).slice(0, 7)}`;
}

/** Khoá tuần `W:gggg-Www` của `instant` theo `tz`. */
export function weekKeyOf(instant: Date, tz: string): string {
  const { year, week } = isoWeekOfDayKey(localDate(instant, tz));
  return `W:${pad(year, 4)}-W${pad(week)}`;
}

/** Phân tích khoá kỳ → khoảng `[from, to)`. Sai định dạng/tháng/tuần không tồn tại → `400 CONTRIB_003`. */
export function parsePeriod(key: string, tz: string): Period {
  if (!PERIOD_KEY_RE.test(key)) throw invalidPeriodError(key);
  if (key === PERIOD_ALL) return { key, kind: "ALL", from: null, to: null };

  if (key.startsWith("M:")) {
    const [y, m] = key.slice(2).split("-").map(Number);
    const firstOfMonth = `${pad(y, 4)}-${pad(m)}-01`;
    const nextMonth = m === 12 ? `${pad(y + 1, 4)}-01-01` : `${pad(y, 4)}-${pad(m + 1)}-01`;
    return { key, kind: "MONTH", from: startOfLocalDateKey(firstOfMonth, tz), to: startOfLocalDateKey(nextMonth, tz) };
  }

  const [yearPart, weekPart] = key.slice(2).split("-W");
  const year = Number(yearPart);
  const week = Number(weekPart);
  if (week > isoWeeksInYear(year)) throw invalidPeriodError(key);
  const monday = isoWeekStartDayKey(year, week);
  return { key, kind: "WEEK", from: startOfLocalDateKey(monday, tz), to: startOfLocalDateKey(addDaysToLocalDate(monday, 7), tz) };
}

/** `instant` có nằm trong kỳ không (`ALL` luôn đúng). */
export function periodContains(period: Period, instant: Date): boolean {
  if (period.from && instant.getTime() < period.from.getTime()) return false;
  if (period.to && instant.getTime() >= period.to.getTime()) return false;
  return true;
}

export const periodToDto = (p: Period, timezone: string) => ({
  key: p.key,
  from: p.from ? p.from.toISOString() : null,
  to: p.to ? p.to.toISOString() : null,
  timezone,
});
