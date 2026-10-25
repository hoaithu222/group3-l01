import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';

// `timezone` cần `utc` đã nạp; `extend` cùng plugin nhiều lần là vô hại (cùng cách `date.utils.ts`).
dayjs.extend(utc);
dayjs.extend(timezone);

/**
 * Đổi một mốc thời gian sang múi giờ của NHÓM (`pm.timezone` do server trả) — ⛔ không đoán theo giờ máy: hai người ở hai múi giờ
 * phải thấy cùng một "ngày". `dayjs(iso).tz(tz)` đổi ĐÚNG khoảnh khắc; múi giờ lạ (ICU của Hermes thiếu) thì rơi về giờ máy thay vì
 * ném lỗi giữa lúc vẽ.
 *
 * ⛔ Thiếu ICU không phải lúc nào cũng NÉM LỖI: nhiều máy trả thẳng một `Dayjs` không hợp lệ (không throw) — `try/catch` một mình
 * không bắt được ca này. Phải tự kiểm `isValid()` sau `.tz()` rồi mới rơi về `dayjs(iso)`, nếu không `todayKeyIn` từng trả thẳng
 * chuỗi `"Invalid Date"` làm mốc `to`, kéo cả `heatmapRange` ra `"NaN-NaN-NaN"` — `GET /boards/:id/heatmap` luôn 400 (`VAL_001`),
 * biểu đồ hoạt động không tải được, không có lỗi nào hiện (`skipErrorToast`).
 */
function inZone(iso: string | Date, tz: string): dayjs.Dayjs {
  try {
    const zoned = dayjs(iso).tz(tz);
    return zoned.isValid() ? zoned : dayjs(iso);
  } catch {
    return dayjs(iso);
  }
}

/** `HH:mm DD/MM` trong múi giờ của nhóm — dòng "Tính lần cuối 10:32 15/09". */
export function formatDateTimeIn(iso: string, tz: string): string {
  const zoned = inZone(iso, tz);
  return zoned.isValid() ? zoned.format('HH:mm DD/MM') : '';
}

/** `DD/MM/YYYY` trong múi giờ của nhóm. */
export function formatDateIn(iso: string, tz: string): string {
  const zoned = inZone(iso, tz);
  return zoned.isValid() ? zoned.format('DD/MM/YYYY') : '';
}

/** Ngày hôm nay (`YYYY-MM-DD`) trong múi giờ của nhóm — mốc `to` của biểu đồ hoạt động. */
export function todayKeyIn(tz: string, now: Date = new Date()): string {
  return inZone(now, tz).format('YYYY-MM-DD');
}
