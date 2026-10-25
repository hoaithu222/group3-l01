import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';

// `timezone` cần `utc` đã nạp; `extend` cùng plugin nhiều lần là vô hại (`date.utils.ts` cũng nạp `utc`).
dayjs.extend(utc);
dayjs.extend(timezone);

const DAY_MS = 86_400_000;

/**
 * Múi giờ của "ngày" p4-04: SERVER là nguồn (`timezone` trong `ReschedulePreviewDto`/`GanttDto`), ⛔ không đoán
 * theo máy — hai người ở hai múi giờ phải thấy cùng một thanh nằm ở cùng một ngày (README p4-04 §10).
 *
 * `dayjs(iso).tz(tz)` (phương thức thể hiện) đổi ĐÚNG khoảnh khắc sang múi giờ đích. ⛔ Không dùng `dayjs.tz(iso, tz)`:
 * với chuỗi nó coi chuỗi là GIỜ ĐỊA PHƯƠNG của `tz` và bỏ qua hậu tố `Z`, lệch tới nửa ngày.
 * Múi giờ lạ (ICU của Hermes thiếu, BE trả tên hỏng) → rơi về giờ máy thay vì ném lỗi giữa lúc vẽ.
 */
function inZone(iso: string, tz: string): dayjs.Dayjs {
  try {
    return dayjs(iso).tz(tz);
  } catch {
    return dayjs(iso);
  }
}

/** Số ngày kể từ 1970-01-01 của NGÀY LỊCH chứa `iso` trong `tz` — hiệu hai số này là số ngày lịch giữa hai mốc. */
export function dayNumberIn(iso: string, tz: string): number {
  const zoned = inZone(iso, tz);
  return Math.round(Date.UTC(zoned.year(), zoned.month(), zoned.date()) / DAY_MS);
}

/** `dd/MM/yyyy` của ngày lịch trong `tz`. */
export function formatDayIn(iso: string | null, tz: string, fallback = ''): string {
  if (!iso) return fallback;
  const zoned = inZone(iso, tz);
  return zoned.isValid() ? zoned.format('DD/MM/YYYY') : fallback;
}

/** Thành phần lịch của một số ngày (kết quả `dayNumberIn`). `weekday`: thứ Hai = 0 … Chủ nhật = 6; 1970-01-01 là thứ Năm. */
export function dayParts(day: number): { date: number; month: number; weekday: number; year: number } {
  const utcDate = dayjs.utc(day * DAY_MS);
  return {
    date: utcDate.date(),
    month: utcDate.month() + 1,
    weekday: (((day + 3) % 7) + 7) % 7,
    year: utcDate.year(),
  };
}

/** `dd/MM` của một số ngày (kết quả `dayNumberIn`). */
export function formatDayNumber(day: number, pattern = 'DD/MM'): string {
  return dayjs.utc(day * DAY_MS).format(pattern);
}

/** Số ngày lịch hôm nay trong `tz`. */
export function todayNumberIn(tz: string, now: Date = new Date()): number {
  return dayNumberIn(now.toISOString(), tz);
}

/**
 * Múi giờ của workspace có LỆCH múi giờ máy không (độ lệch UTC tại thời điểm `now`) — quyết định có hiện ghi chú
 * "Ngày theo múi giờ …" dưới trục hay không (app.md §7). So độ lệch chứ không so tên: `Asia/Saigon` và
 * `Asia/Ho_Chi_Minh` là cùng một nơi.
 */
export function differsFromDevice(tz: string, now: Date = new Date()): boolean {
  try {
    return dayjs(now).tz(tz).utcOffset() !== dayjs(now).utcOffset();
  } catch {
    return false;
  }
}
