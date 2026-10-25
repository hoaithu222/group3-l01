import dayjs, { type Dayjs } from 'dayjs';

import {
  CALENDAR_COLUMNS,
  CALENDAR_ROWS,
  DECADE_LENGTH,
  RANGE_SEPARATOR,
  UNIT_GRID_SIZE,
} from './date-picker.constants';
import type { CalendarLocale, DateLike, DateRange, WeekdayIndex } from './date-picker.types';

/**
 * Hàm thuần cho lưới lịch. Tách khỏi component để test được bằng logic chứ
 * không phải qua render, và để `Calendar.tsx` giữ dưới 200 dòng.
 *
 * ⛔ Nguyên tắc xuyên suốt file: MỌI so sánh theo NGÀY ĐỊA PHƯƠNG bằng
 * `isSame(other, 'day')`. So `getTime()` là sai — `new Date(2026, 8, 8)` và
 * `new Date(2026, 8, 8, 15, 30)` cùng một ngày nhưng khác timestamp, nên
 * "ngày đang chọn" sẽ không sáng lên nếu giá trị từ máy chủ có kèm giờ.
 */

/**
 * Chuẩn hoá về nửa đêm GIỜ ĐỊA PHƯƠNG, `null` nếu không hợp lệ.
 *
 * ⚠️ Dùng `dayjs(value)` chứ không `new Date(value)`: với chuỗi `2026-09-08`
 * thì `new Date` hiểu là nửa đêm UTC (ở Việt Nam ra 07:00 cùng ngày, ở châu Mỹ
 * ra hôm TRƯỚC), còn dayjs phân giải theo giờ địa phương.
 */
export function toDay(value: DateLike | null | undefined): Dayjs | null {
  if (value === null || value === undefined || value === '') return null;
  const day = dayjs(value);
  return day.isValid() ? day.startOf('day') : null;
}

/** `Date` nửa đêm giờ địa phương — dạng trả ra cho nơi gọi. */
export function toLocalDate(day: Dayjs): Date {
  return day.startOf('day').toDate();
}

/**
 * Lưới 6×7 bắt đầu từ `firstDayOfWeek`.
 *
 * Luôn đủ 6 hàng, kể cả tháng chỉ chiếm 5 — xem `CALENDAR_ROWS` để biết vì sao.
 * Ngày của tháng trước/sau vẫn có mặt (bản thiết kế vẽ chúng màu mờ).
 */
export function buildMonthGrid(month: Dayjs, firstDayOfWeek: WeekdayIndex): Dayjs[][] {
  const firstOfMonth = month.startOf('month');
  const offset = (firstOfMonth.day() - firstDayOfWeek + CALENDAR_COLUMNS) % CALENDAR_COLUMNS;
  const gridStart = firstOfMonth.subtract(offset, 'day');

  return Array.from({ length: CALENDAR_ROWS }, (_, row) =>
    Array.from({ length: CALENDAR_COLUMNS }, (_, column) =>
      gridStart.add(row * CALENDAR_COLUMNS + column, 'day'),
    ),
  );
}

/** Nhãn thứ trên đầu lưới, xoay theo `firstDayOfWeek`. */
export function orderedWeekdays(
  locale: CalendarLocale,
  firstDayOfWeek: WeekdayIndex,
): readonly string[] {
  return Array.from(
    { length: CALENDAR_COLUMNS },
    (_, index) => locale.weekdaysShort[(firstDayOfWeek + index) % CALENDAR_COLUMNS] ?? '',
  );
}

export interface DayLimits {
  disabledDays?: readonly Dayjs[];
  maxDay?: Dayjs | null;
  minDay?: Dayjs | null;
}

/** Ngoài `min`/`max` hoặc nằm trong danh sách khoá thì không bấm được. */
export function isDayDisabled(day: Dayjs, limits: DayLimits): boolean {
  const { disabledDays, maxDay, minDay } = limits;
  if (minDay && day.isBefore(minDay, 'day')) return true;
  if (maxDay && day.isAfter(maxDay, 'day')) return true;
  return Boolean(disabledDays?.some((blocked) => blocked.isSame(day, 'day')));
}

/**
 * Năm ĐẦU của thập kỷ chứa `year` (2024 → 2020, 1999 → 1990).
 *
 * ⚠️ `Math.floor` chứ không `Math.trunc`: hai hàm chỉ khác nhau ở số âm, mà năm
 * âm thì không có — nhưng `floor` cũng là thứ giữ cho công thức đúng nếu ai đó
 * đổi `DECADE_LENGTH`.
 */
export function decadeStart(year: number): number {
  return Math.floor(year / DECADE_LENGTH) * DECADE_LENGTH;
}

/**
 * 12 ô của lưới chọn Năm: năm liền TRƯỚC thập kỷ, 10 năm trong, năm liền SAU.
 * Xem `UNIT_GRID_SIZE` để biết vì sao lưới 12 ô mà thập kỷ chỉ có 10 năm.
 */
export function buildDecadeCells(decadeFrom: number): number[] {
  return Array.from({ length: UNIT_GRID_SIZE }, (_, index) => decadeFrom - 1 + index);
}

/** Cả năm nằm ngoài `min`/`max` ⇒ ô năm không bấm được. */
export function isYearDisabled(year: number, limits: DayLimits): boolean {
  const { maxDay, minDay } = limits;
  if (minDay && year < minDay.year()) return true;
  return Boolean(maxDay && year > maxDay.year());
}

/**
 * Cả tháng nằm ngoài `min`/`max` ⇒ ô tháng không bấm được.
 *
 * ⚠️ So bằng CẶP SỐ (năm, tháng) chứ không dựng `Date`: `dayjs().month(1)` khi
 * hôm nay là ngày 31 thì tràn sang tháng sau, và ô "Tháng 2" bỗng bị khoá theo
 * giới hạn của tháng 3. ⛔ `disabledDates` cố ý KHÔNG xét ở đây — một ngày lễ
 * bị khoá không làm cả tháng hết chọn được.
 */
export function isMonthDisabled(year: number, month: number, limits: DayLimits): boolean {
  const { maxDay, minDay } = limits;
  if (minDay && (year < minDay.year() || (year === minDay.year() && month < minDay.month()))) {
    return true;
  }
  return Boolean(
    maxDay && (year > maxDay.year() || (year === maxDay.year() && month > maxDay.month())),
  );
}

/** Nhãn ô của lưới Tháng. Locale cũ không khai `monthLabel` thì rơi về tiếng Việt. */
export function monthLabelOf(locale: CalendarLocale, month: number): string {
  return locale.monthLabel?.(month) ?? `Tháng ${month + 1}`;
}

/** Tiêu đề lưới Năm ("2020 – 2029"). Gạch ngang DÀI, đúng bản vẽ. */
export function decadeTitleOf(locale: CalendarLocale, from: number, to: number): string {
  return locale.decadeTitle?.(from, to) ?? `${from} – ${to}`;
}

/** Nhãn cho trình đọc màn hình: "Thứ Hai, 8 tháng 9 năm 2026". */
export function describeDay(day: Dayjs, locale: CalendarLocale): string {
  const weekday = locale.weekdaysLong[day.day()] ?? '';
  return `${weekday}, ${day.date()} tháng ${day.month() + 1} năm ${day.year()}`;
}

/** Ngày nằm giữa hai đầu khoảng (không tính chính hai đầu). */
export function isBetween(day: Dayjs, start: Dayjs, end: Dayjs): boolean {
  return day.isAfter(start, 'day') && day.isBefore(end, 'day');
}

/**
 * Nhịp chọn khoảng: chọn đầu thứ nhất → chọn đầu thứ hai → chọn lại từ đầu.
 *
 * ⚠️ Bấm đầu thứ hai TRƯỚC đầu thứ nhất thì ĐỔI CHỖ chứ không bỏ qua. Người
 * dùng hay bấm "đến ngày" trước rồi mới nhớ ra "từ ngày"; bắt họ làm lại đúng
 * thứ tự là bắt họ đoán luật của mình.
 */
export function nextRange(current: DateRange | null | undefined, day: Dayjs): DateRange {
  const start = toDay(current?.start);
  const end = toDay(current?.end);

  if (!start || end) return { end: null, start: toLocalDate(day) };
  if (day.isBefore(start, 'day')) return { end: toLocalDate(start), start: toLocalDate(day) };
  return { end: toLocalDate(day), start: toLocalDate(start) };
}

/** Chuỗi hiện trong ô nhập. Chuỗi rỗng ⇒ ô hiện placeholder. */
export function formatValue(
  value: DateLike | DateRange | null | undefined,
  format: string,
): string {
  if (value === null || value === undefined) return '';

  if (typeof value === 'object' && !(value instanceof Date)) {
    const start = toDay(value.start);
    const end = toDay(value.end);
    if (!start) return '';
    return end
      ? `${start.format(format)}${RANGE_SEPARATOR}${end.format(format)}`
      : start.format(format);
  }

  return toDay(value)?.format(format) ?? '';
}
