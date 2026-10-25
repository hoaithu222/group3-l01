import type { PeriodKey } from '../api/contribution.types';

/** Kỳ mặc định khi mở màn — tích luỹ toàn bộ thời gian của bảng. */
export const ALL_PERIOD: PeriodKey = 'ALL';

export type PeriodKind = 'ALL' | 'MONTH' | 'WEEK';

const MONTH_RE = /^M:(\d{4})-(0[1-9]|1[0-2])$/;
const WEEK_RE = /^W:(\d{4})-W(0[1-9]|[1-4]\d|5[0-3])$/;
const DAY_MS = 86_400_000;

/** Kiểm dạng khoá kỳ — query param `?period=` là dữ liệu không đáng tin (deep link), sai thì rơi về `ALL` thay vì gọi API với nó. */
export function isPeriodKey(value: unknown): value is PeriodKey {
  return typeof value === 'string' && (value === ALL_PERIOD || MONTH_RE.test(value) || WEEK_RE.test(value));
}

export function periodKindOf(key: PeriodKey): PeriodKind {
  if (MONTH_RE.test(key)) return 'MONTH';
  return WEEK_RE.test(key) ? 'WEEK' : 'ALL';
}

/** `M:2026-09` → `"Tháng 9/2026"`. */
export function monthLabel(key: PeriodKey): string {
  const match = MONTH_RE.exec(key);
  return match ? `Tháng ${Number(match[2])}/${match[1]}` : key;
}

/** Thứ Hai của tuần ISO `(year, week)` dưới dạng mốc UTC — ngày 4/1 luôn thuộc tuần 1 nên đếm lùi từ đó. */
function isoWeekMonday(year: number, week: number): number {
  const jan4 = Date.UTC(year, 0, 4);
  const weekday = (new Date(jan4).getUTCDay() + 6) % 7; // thứ Hai = 0
  return jan4 - weekday * DAY_MS + (week - 1) * 7 * DAY_MS;
}

const pad = (n: number): string => String(n).padStart(2, '0');

/** `W:2026-W37` → `"07–13/09"` (khác tháng: `"28/12–03/01"`). */
export function weekRangeText(key: PeriodKey): string {
  const match = WEEK_RE.exec(key);
  if (!match) return '';
  const start = new Date(isoWeekMonday(Number(match[1]), Number(match[2])));
  const end = new Date(start.getTime() + 6 * DAY_MS);
  const startDay = pad(start.getUTCDate());
  const endText = `${pad(end.getUTCDate())}/${pad(end.getUTCMonth() + 1)}`;
  return start.getUTCMonth() === end.getUTCMonth()
    ? `${startDay}–${endText}`
    : `${startDay}/${pad(start.getUTCMonth() + 1)}–${endText}`;
}

/** `W:2026-W37` → `"Tuần 37/2026 · 07–13/09"`. */
export function weekLabel(key: PeriodKey): string {
  const match = WEEK_RE.exec(key);
  return match ? `Tuần ${Number(match[2])}/${match[1]} · ${weekRangeText(key)}` : key;
}

export function periodLabel(key: PeriodKey): string {
  switch (periodKindOf(key)) {
    case 'MONTH':
      return monthLabel(key);
    case 'WEEK':
      return weekLabel(key);
    default:
      return 'Toàn bộ';
  }
}
