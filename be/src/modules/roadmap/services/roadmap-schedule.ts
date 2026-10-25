import { addDaysToLocalDate, diffLocalDates, localDate, startOfLocalDateKey } from "../../../core/utils/local-date";

/** ISO: 1 = Thứ 2 … 7 = Chủ nhật — thứ trong tuần của một ngày lịch `YYYY-MM-DD` (không phụ thuộc múi giờ). */
export function isoWeekday(dateKey: string): number {
  const [y, m, d] = dateKey.split("-").map(Number);
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return day === 0 ? 7 : day;
}

function isStudyDateKey(dateKey: string, studyDays: readonly number[]): boolean {
  return studyDays.includes(isoWeekday(dateKey));
}

/** Ngày học gần nhất >= `dateKey` theo `studyDays` (chính nó nếu đã là ngày học). */
export function nextStudyDateKey(dateKey: string, studyDays: readonly number[]): string {
  let d = dateKey;
  for (let i = 0; i < 7; i++) {
    if (isStudyDateKey(d, studyDays)) return d;
    d = addDaysToLocalDate(d, 1);
  }
  return dateKey;
}

/** Ngày học gần nhất <= `dateKey`. */
export function prevStudyDateKey(dateKey: string, studyDays: readonly number[]): string {
  let d = dateKey;
  for (let i = 0; i < 7; i++) {
    if (isStudyDateKey(d, studyDays)) return d;
    d = addDaysToLocalDate(d, -1);
  }
  return dateKey;
}

/**
 * Ngày dự kiến (`YYYY-MM-DD`) cho MỖI buổi 1..`maxNumber`, tính một lượt từ mốc `(anchorDateKey, anchorNumber)` theo
 * `studyDays` (be.md §5.3) — buổi mốc neo vào ngày học gần nhất >= `anchorDateKey`; các buổi sau/trước nối tiếp theo
 * đúng nhịp học, bỏ qua ngày không học. `anchorDateKey` LUÔN là chuỗi ngày địa phương (`localDate(enrollment.anchorDate, tz)`),
 * không phải `Date` UTC thô — gọi nơi dùng tự quy đổi qua `local-date.ts`.
 */
export function scheduleMap(maxNumber: number, anchorDateKey: string, anchorNumber: number, studyDays: readonly number[]): Map<number, string> {
  const map = new Map<number, string>();
  if (studyDays.length === 0 || maxNumber < 1) return map;
  const effectiveAnchor = nextStudyDateKey(anchorDateKey, studyDays);
  if (anchorNumber >= 1 && anchorNumber <= maxNumber) map.set(anchorNumber, effectiveAnchor);

  let d = effectiveAnchor;
  for (let n = anchorNumber + 1; n <= maxNumber; n++) {
    d = nextStudyDateKey(addDaysToLocalDate(d, 1), studyDays);
    map.set(n, d);
  }
  d = effectiveAnchor;
  for (let n = anchorNumber - 1; n >= 1; n--) {
    d = prevStudyDateKey(addDaysToLocalDate(d, -1), studyDays);
    map.set(n, d);
  }
  return map;
}

/** `true` khi ngày dự kiến đã qua so với hôm nay (theo múi giờ đăng ký) — dùng để đếm "trễ N buổi". */
export function isOverdue(scheduledDateKey: string, todayKey: string): boolean {
  return diffLocalDates(scheduledDateKey, todayKey) > 0;
}

/** Chuỗi ngày địa phương của "hôm nay" theo múi giờ đăng ký — điểm neo duy nhất để so "trễ". */
export function todayKeyOf(timezone: string): string {
  return localDate(new Date(), timezone);
}

/** `anchorDateKey` (`YYYY-MM-DD`, đầu vào từ DTO `enrollSchema`) → `Date` UTC lưu `RoadmapEnrollment.anchorDate`. */
export function toAnchorDate(anchorDateKey: string, timezone: string): Date {
  return startOfLocalDateKey(anchorDateKey, timezone);
}

/** Chiều ngược của `toAnchorDate` — đọc lại chuỗi ngày địa phương từ `Date` đã lưu, để tính `scheduleMap`. */
export function anchorDateKeyOf(anchorDate: Date, timezone: string): string {
  return localDate(anchorDate, timezone);
}
