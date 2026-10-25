import { tCommon } from '../i18n';
import { toZoned, zonedDayDiff, type DateLike } from './zoned';

/** Thứ theo `ZonedParts.weekday` (0 = Chủ Nhật) — viết hoa từng chữ, đúng cách người Việt viết thứ. */
const WEEKDAY_LABELS = [
  'Chủ Nhật',
  'Thứ Hai',
  'Thứ Ba',
  'Thứ Tư',
  'Thứ Năm',
  'Thứ Sáu',
  'Thứ Bảy',
] as const;

const pad2 = (value: number): string => String(value).padStart(2, '0');

export interface ZonedFormatOptions {
  /** Múi giờ IANA. Bỏ trống = múi giờ thiết bị. */
  timeZone?: string;
}

export interface DateSeparatorOptions extends ZonedFormatOptions {
  /**
   * "Bây giờ" để so "hôm nay". ⛔ Gọi trong RENDER thì phải truyền giá trị từ state (`useNow`): mặc định đọc
   * `Date.now()` — React Compiler (đang bật) ghi nhớ kết quả theo đầu vào nên nhãn "Hôm nay" sẽ đứng im qua nửa đêm.
   */
  now?: DateLike;
}

/**
 * Nhãn ngăn cách ngày trong danh sách (chat, hoạt động):
 *  · cùng ngày lịch   → "Hôm nay"
 *  · hôm trước        → "Hôm qua"
 *  · cùng năm         → "Thứ Hai, 14/09"
 *  · năm khác         → "14/09/2025"
 * Ngày lịch tính theo `timeZone` (mặc định thiết bị) — 23:59 và 00:01 giờ Việt Nam là hai ngày, dù cách nhau 2 phút.
 * Chuỗi rỗng khi `input` không hợp lệ.
 */
export function formatDateSeparator(input: DateLike, options: DateSeparatorOptions = {}): string {
  const { timeZone, now = Date.now() } = options;
  const target = toZoned(input, timeZone);
  const today = toZoned(now, timeZone);
  const diff = zonedDayDiff(now, input, timeZone);
  if (!target || !today || diff === null) return '';

  if (diff === 0) return tCommon('time.today');
  if (diff === 1) return tCommon('time.yesterday');

  const dayMonth = `${pad2(target.day)}/${pad2(target.month)}`;
  if (target.year !== today.year) return `${dayMonth}/${String(target.year)}`;
  return `${WEEKDAY_LABELS[target.weekday] ?? ''}, ${dayMonth}`;
}

/** Giờ `HH:mm` (24 giờ) theo `timeZone`. Chuỗi rỗng khi không hợp lệ. */
export function formatTimeInZone(input: DateLike, options: ZonedFormatOptions = {}): string {
  const zoned = toZoned(input, options.timeZone);
  return zoned ? `${pad2(zoned.hour)}:${pad2(zoned.minute)}` : '';
}

/** Ngày `dd/MM/yyyy` theo `timeZone` (thứ tự ngày/tháng/năm — quy ước Việt Nam). Chuỗi rỗng khi không hợp lệ. */
export function formatDateInZone(input: DateLike, options: ZonedFormatOptions = {}): string {
  const zoned = toZoned(input, options.timeZone);
  return zoned ? `${pad2(zoned.day)}/${pad2(zoned.month)}/${String(zoned.year)}` : '';
}
