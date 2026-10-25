import { localParts } from "../../../core/utils/local-date";
import type { OpenHour } from "../entities/o2o.interface";

/** "HH:mm" 00:00–23:59 (giờ đóng có thể "24:00" = nửa đêm). */
export const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$|^24:00$/;

export function minutesOf(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

/** Khung giờ hợp lệ: đúng định dạng và đóng SAU mở (không hỗ trợ qua nửa đêm — tách thành 2 dòng ngày). */
export function isValidOpenHour(h: OpenHour): boolean {
  return (
    Number.isInteger(h.day) && h.day >= 0 && h.day <= 6 && TIME_PATTERN.test(h.open) && TIME_PATTERN.test(h.close) && minutesOf(h.close) > minutesOf(h.open)
  );
}

/** Thứ (0 = CN) và phút trong ngày của `at` tại múi giờ `tz`. */
export function localDayMinute(at: Date, tz: string): { day: number; minute: number } {
  const p = localParts(at, tz);
  return { day: new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay(), minute: p.hour * 60 + p.minute };
}

/**
 * Đang mở cửa lúc `at` (giờ địa phương `tz`)? Không khai giờ mở → `null` (không biết — app hiện "Chưa có giờ mở cửa",
 * lọc `openNow` loại địa điểm này).
 */
export function isOpenAt(openHours: readonly OpenHour[], at: Date, tz: string): boolean | null {
  if (openHours.length === 0) return null;
  const { day, minute } = localDayMinute(at, tz);
  return openHours.some((h) => h.day === day && minute >= minutesOf(h.open) && minute < minutesOf(h.close));
}
