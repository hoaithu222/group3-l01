import { dayNumber, toZoned, type DateLike } from '@/shared/utils/datetime';

import { ROADMAP_WEEKDAYS } from '../constants/roadmap.constants';

/**
 * Ngày của lộ trình ở dạng "day number" (số ngày LỊCH tính từ 1/1/1970) — cùng hệ đếm với `roadmap-schedule.ts`,
 * nên so "trễ/hôm nay/ngày mai" chỉ là phép trừ hai số nguyên.
 *
 * ⚠️ `schedule[lessonId]` là KHOÁ NGÀY `YYYY-MM-DD` (không giờ, không múi giờ). ⛔ Đừng `new Date(key)`: JS đọc chuỗi
 * đó là NỬA ĐÊM UTC ⇒ ở múi giờ âm nó lùi về HÔM TRƯỚC và nhãn "Hôm nay" lệch một ngày. Tách số rồi `Date.UTC` thì
 * khoá ngày giữ đúng nghĩa "ngày lịch", không phụ thuộc giờ máy.
 */

const MS_PER_DAY = 86_400_000;
const DATE_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;

const pad2 = (value: number): string => String(value).padStart(2, '0');

/** `'2026-10-01'` → day number; `null` khi thiếu hoặc sai khuôn. */
export function dateKeyToDay(key: string | null | undefined): number | null {
  const match = key ? DATE_KEY.exec(key) : null;
  if (!match) return null;
  const ms = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isFinite(ms) ? Math.floor(ms / MS_PER_DAY) : null;
}

/**
 * "Hôm nay" theo múi giờ của lộ trình (`enrollment.timezone`; bỏ trống = giờ máy). ⛔ Truyền `now` từ state
 * (`useNow`) — gọi `Date.now()` trong render thì React Compiler ghi nhớ kết quả và nhãn đứng im qua nửa đêm.
 */
export function todayDay(now: DateLike, timeZone?: string): number | null {
  const zoned = toZoned(now, timeZone);
  return zoned ? dayNumber(zoned) : null;
}

/** Thứ ISO (`1` Thứ 2 … `7` Chủ nhật) — khớp `ROADMAP_WEEKDAYS`/`studyDays` của BE. */
function isoWeekday(day: number): number {
  const jsWeekday = new Date(day * MS_PER_DAY).getUTCDay(); // 0 = Chủ nhật
  return jsWeekday === 0 ? 7 : jsWeekday;
}

export interface PlanDayFormat {
  /** "Hôm nay/Ngày mai/Hôm qua" thay cho ngày cụ thể. Mặc định bật. */
  relative?: boolean;
  /** `short` "T5" (dòng buổi học — chỗ hẹp) · `long` "Thứ 5" (thẻ tóm tắt). */
  weekday?: 'short' | 'long';
}

/**
 * Nhãn ngày dự kiến gọn cho di động: "Hôm nay" · "Ngày mai" · "Hôm qua" · "T5, 09/10" (cùng năm) · "T5, 09/10/2027".
 *
 * ⚠️ Vì sao không `formatDate` (dd/MM/yyyy) như trước: trên dòng buổi học "01/10/2026" chiếm nửa hàng (ảnh chụp thật —
 * tiêu đề bị ép xuống 5 dòng), còn năm thì lặp lại y hệt ở MỌI dòng. Thứ trong tuần mới là thông tin người học cần
 * ("thứ mấy phải học?"), năm chỉ hiện khi khác năm nay.
 */
export function formatPlanDay(day: number, today: number | null, options: PlanDayFormat = {}): string {
  const { relative = true, weekday = 'short' } = options;
  if (relative && today !== null) {
    const diff = day - today;
    if (diff === 0) return 'Hôm nay';
    if (diff === 1) return 'Ngày mai';
    if (diff === -1) return 'Hôm qua';
  }
  const date = new Date(day * MS_PER_DAY);
  const dayMonth = `${pad2(date.getUTCDate())}/${pad2(date.getUTCMonth() + 1)}`;
  const sameYear =
    today !== null && new Date(today * MS_PER_DAY).getUTCFullYear() === date.getUTCFullYear();
  const meta = ROADMAP_WEEKDAYS.find((item) => item.value === isoWeekday(day));
  const weekdayLabel = meta ? (weekday === 'short' ? meta.short : meta.label) : '';
  const dateLabel = sameYear ? dayMonth : `${dayMonth}/${String(date.getUTCFullYear())}`;
  return weekdayLabel ? `${weekdayLabel}, ${dateLabel}` : dateLabel;
}

/** Thời lượng buổi học: 45 → "45 phút", 90 → "1 giờ 30 phút", 180 → "3 giờ" (đọc nhanh hơn "180 phút"). */
export function formatStudyMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${String(rest)} phút`;
  return rest === 0 ? `${String(hours)} giờ` : `${String(hours)} giờ ${String(rest)} phút`;
}

/** Độ dài một chặng học cho người đọc: "khoảng 3 tuần" · "khoảng 7 tháng" (xem trước ở `EnrollSheet`). */
export function formatStudySpan(fromDay: number, toDay: number): string {
  const days = Math.max(1, toDay - fromDay + 1);
  if (days < 60) return `khoảng ${String(Math.max(1, Math.round(days / 7)))} tuần`;
  return `khoảng ${String(Math.round(days / 30))} tháng`;
}
