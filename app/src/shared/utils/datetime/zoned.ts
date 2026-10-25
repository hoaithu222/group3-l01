/**
 * Ngày giờ THEO MÚI GIỜ — nền cho "Hôm nay/Hôm qua", giờ họp theo múi giờ của cuộc họp (p0-12, D-18).
 *
 * ── Quy ước ──────────────────────────────────────────────────────────────────
 * Lưu và truyền UTC (ISO-8601); chỉ khi HIỂN THỊ mới đổi sang múi giờ: mặc định múi giờ của THIẾT BỊ, và
 * múi giờ của cuộc họp khi vẽ lịch họp. `dayjs` (`format/date.utils.ts`) đủ cho định dạng theo giờ máy; file này
 * lo phần dayjs không làm gọn được: quy đổi sang MỘT múi giờ TUỲ Ý rồi so sánh NGÀY lịch.
 *
 * ── Vì sao `Intl.DateTimeFormat` mà không phải dữ liệu ngôn ngữ ─────────────────
 * Comment đầu `date.utils.ts` cảnh báo Hermes cắt ICU nên CHỮ ngày tháng khác nhau giữa Android/iOS. Ở đây ta chỉ
 * xin các SỐ (năm/tháng/ngày/giờ…) theo `timeZone` với locale cố định — không phụ thuộc dữ liệu chữ nên hai nền
 * tảng ra cùng kết quả. Thứ trong tuần tự tính từ ngày (không xin `weekday` của Intl, vì đó mới là chữ).
 * `timeZone` không hợp lệ / môi trường không hỗ trợ ⇒ rơi về múi giờ THIẾT BỊ thay vì ném lỗi.
 */

export type DateLike = Date | number | string;

/** Đồng hồ treo tường ở một múi giờ. `month` 1–12; `weekday` 0 = Chủ Nhật … 6 = Thứ Bảy. */
export interface ZonedParts {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
  readonly second: number;
  readonly weekday: number;
}

const MS_PER_DAY = 86_400_000;

/** Múi giờ IANA của thiết bị (`Asia/Ho_Chi_Minh`…); `undefined` khi môi trường không cho biết. */
export function deviceTimeZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
}

const formatters = new Map<string, Intl.DateTimeFormat | null>();

function formatterFor(timeZone: string): Intl.DateTimeFormat | null {
  if (formatters.has(timeZone)) return formatters.get(timeZone) ?? null;
  let formatter: Intl.DateTimeFormat | null = null;
  try {
    formatter = new Intl.DateTimeFormat('en-US', {
      day: 'numeric',
      hour: 'numeric',
      hourCycle: 'h23',
      minute: 'numeric',
      month: 'numeric',
      second: 'numeric',
      timeZone,
      year: 'numeric',
    });
  } catch {
    formatter = null; // RangeError: múi giờ lạ — nhớ luôn để không thử lại mỗi lần gọi.
  }
  formatters.set(timeZone, formatter);
  return formatter;
}

function weekdayOf(year: number, month: number, day: number): number {
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

function fromDeviceClock(date: Date): ZonedParts {
  return {
    day: date.getDate(),
    hour: date.getHours(),
    minute: date.getMinutes(),
    month: date.getMonth() + 1,
    second: date.getSeconds(),
    weekday: date.getDay(),
    year: date.getFullYear(),
  };
}

/**
 * Đổi một thời điểm sang đồng hồ treo tường ở `timeZone` (bỏ trống = múi giờ thiết bị). `null` khi `input` không
 * phải ngày hợp lệ.
 */
export function toZoned(input: DateLike, timeZone?: string): ZonedParts | null {
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) return null;
  if (!timeZone) return fromDeviceClock(date);

  const formatter = formatterFor(timeZone);
  if (!formatter) return fromDeviceClock(date);

  const values: Record<string, number> = {};
  for (const part of formatter.formatToParts(date)) {
    if (part.type !== 'literal') values[part.type] = Number(part.value);
  }
  const { year = 0, month = 0, day = 0, minute = 0, second = 0 } = values;
  // Một số engine in nửa đêm là "24" dù đã xin `h23`.
  const hour = (values.hour ?? 0) % 24;
  return { day, hour, minute, month, second, weekday: weekdayOf(year, month, day), year };
}

/** Số ngày lịch tính từ mốc cố định — hiệu hai số này là "cách nhau mấy ngày" bất kể giờ trong ngày. */
export function dayNumber(parts: ZonedParts): number {
  return Math.floor(Date.UTC(parts.year, parts.month - 1, parts.day) / MS_PER_DAY);
}

/** Số ngày LỊCH `a` sau `b` (âm nếu trước) theo `timeZone`; `null` khi ngày không hợp lệ. */
export function zonedDayDiff(a: DateLike, b: DateLike, timeZone?: string): number | null {
  const pa = toZoned(a, timeZone);
  const pb = toZoned(b, timeZone);
  return pa && pb ? dayNumber(pa) - dayNumber(pb) : null;
}

export function isSameZonedDay(a: DateLike, b: DateLike, timeZone?: string): boolean {
  return zonedDayDiff(a, b, timeZone) === 0;
}
