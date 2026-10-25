/**
 * Định dạng số phút/ngày cho màn Sức khoẻ — TIẾNG VIỆT, ngày theo quy ước Việt Nam (ngày/tháng). Không dùng `Intl`: Hermes cắt bớt dữ liệu ngôn ngữ nên hai
 * nền tảng có thể ra hai kết quả khác nhau (xem `shared/utils/format/date.utils.ts`). Ngày wellbeing là chuỗi `YYYY-MM-DD` (lịch, không kèm giờ/múi giờ) nên
 * cắt chuỗi ở đây là đúng và tránh hẳn bẫy múi giờ của `new Date('2026-09-12')` (đọc như nửa đêm UTC, lùi một ngày ở máy múi giờ âm).
 */

/** `195` → "3 giờ 15 phút", `60` → "1 giờ", `45` → "45 phút", `0` → "0 phút". Số âm/không hợp lệ ⇒ "0 phút" (không bao giờ hiện "NaN"). */
export function formatMinutes(total: number): string {
  const minutes = Number.isFinite(total) ? Math.max(0, Math.round(total)) : 0;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${String(rest)} phút`;
  if (rest === 0) return `${String(hours)} giờ`;
  return `${String(hours)} giờ ${String(rest)} phút`;
}

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** `"2026-09-12"` → `{ year, month, day }`; chuỗi lạ ⇒ `null`. */
function splitDate(date: string): { day: number; month: number; year: number } | null {
  const match = DATE_PATTERN.exec(date);
  if (!match) return null;
  return { day: Number(match[3]), month: Number(match[2]), year: Number(match[1]) };
}

/** `"2026-09-12"` → "12/09". Chuỗi lạ ⇒ chính chuỗi đó (thà hiện thô còn hơn hiện sai). */
export function formatDayMonth(date: string): string {
  const parts = splitDate(date);
  if (!parts) return date;
  return `${String(parts.day).padStart(2, '0')}/${String(parts.month).padStart(2, '0')}`;
}

const WEEKDAYS_SHORT = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'] as const;
const WEEKDAYS_LONG = [
  'Chủ nhật',
  'Thứ hai',
  'Thứ ba',
  'Thứ tư',
  'Thứ năm',
  'Thứ sáu',
  'Thứ bảy',
] as const;

const weekdayIndex = (date: string): number | null => {
  const parts = splitDate(date);
  if (!parts) return null;
  // `Date.UTC` + `getUTCDay`: thứ của NGÀY LỊCH, không lệch theo múi giờ máy.
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();
};

/** Thứ viết tắt ("T2"…"T7", "CN") để làm nhãn trục; chuỗi lạ ⇒ rỗng. */
export function weekdayShort(date: string): string {
  const index = weekdayIndex(date);
  return index === null ? '' : (WEEKDAYS_SHORT[index] ?? '');
}

/** Thứ đầy đủ ("Thứ hai") cho câu trình đọc màn hình — "T2" đọc thành "tê hai" thì không ai hiểu. */
export function weekdayLong(date: string): string {
  const index = weekdayIndex(date);
  return index === null ? '' : (WEEKDAYS_LONG[index] ?? '');
}

/** Cộng/trừ ngày trên ngày lịch `YYYY-MM-DD` (không đụng múi giờ). Chuỗi lạ ⇒ trả nguyên. */
export function addDays(date: string, delta: number): string {
  const parts = splitDate(date);
  if (!parts) return date;
  const moved = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + delta));
  return moved.toISOString().slice(0, 10);
}
