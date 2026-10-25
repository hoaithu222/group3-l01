/**
 * Ngày giờ dùng chung — MỘT cửa (`@/shared/utils/datetime`).
 *
 *  · `zoned.ts`    — đổi sang múi giờ tuỳ ý, so sánh ngày lịch (`toZoned`, `zonedDayDiff`).
 *  · `format.ts`   — nhãn có múi giờ: `formatDateSeparator` ("Hôm nay"/"Hôm qua"/"Thứ Hai, 14/09"), `formatTimeInZone`.
 *  · `duration.ts` — `formatDuration(giây)` ("1:02:05").
 *
 * Định dạng theo GIỜ MÁY (không cần múi giờ khác) đã có ở `../format/date.utils.ts` (dayjs, tiếng Việt) — re-export
 * dưới đây để nơi gọi chỉ nhớ một đường dẫn. Nhớ: mọi ngày hiển thị đi qua các hàm này, đừng để `Intl` mặc định
 * quyết định thứ tự ngày/tháng.
 */
export { formatDateInZone, formatDateSeparator, formatTimeInZone } from './format';
export type { DateSeparatorOptions, ZonedFormatOptions } from './format';
export { formatDuration } from './duration';
export {
  dayNumber,
  deviceTimeZone,
  isSameZonedDay,
  toZoned,
  zonedDayDiff,
  type DateLike,
  type ZonedParts,
} from './zoned';

export {
  formatDate,
  formatDateTime,
  formatLongDate,
  formatRelative,
  formatRelativeShort,
  formatTime,
  isToday,
  toApiDate,
} from '../format/date.utils';
