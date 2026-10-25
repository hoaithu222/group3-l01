import { dayNumber, toZoned, type DateLike } from '@/shared/utils/datetime';

/**
 * Hàm lịch THUẦN của lộ trình học — bản sao tay của be.md p4-07 §5.3 (`roadmap-schedule.ts` phía BE; module đang
 * được dựng SONG SONG, chưa chạy được nên không đối chiếu được bằng request thật — chỉ đối chiếu bằng chữ đặc tả).
 * Dùng để XEM TRƯỚC lịch ở `EnrollSheet` trước khi có enrollment thật; sau khi đăng ký, nguồn sự thật là
 * `SubjectDetailDto.schedule` do BE trả (app KHÔNG tự tính lại đè lên dữ liệu server một khi đã có).
 */

const MS_PER_DAY = 86_400_000;

export interface RoadmapScheduleAnchor {
  anchorDate: DateLike;
  /** Số thứ tự buổi mốc — lúc đăng ký = buổi 1 (hoặc buổi đầu tiên chọn học), lúc dời lịch = buổi chưa xong kế tiếp. */
  anchorNumber: number;
  /** `1` Thứ 2 … `7` Chủ nhật. */
  studyDays: readonly number[];
  timezone?: string;
}

/** Thứ ISO (`1` Thứ 2 … `7` Chủ nhật) của một "day number" — mốc 0 = 1/1/1970 (Thứ 5, JS weekday 4). */
function isoWeekdayOfDayNumber(day: number): number {
  const jsWeekday = (((day + 4) % 7) + 7) % 7; // 0 = Chủ nhật … 6 = Thứ 7 (kiểu `Date.getUTCDay`)
  return jsWeekday === 0 ? 7 : jsWeekday;
}

function normalizedStudyDays(studyDays: readonly number[]): number[] {
  return Array.from(new Set(studyDays.filter((d) => d >= 1 && d <= 7))).sort((a, b) => a - b);
}

/** Ngày học đầu tiên `>= from` (hoặc `> from` khi `strict`) — vòng lặp tối đa 7 bước vì `days` không rỗng. */
function forwardStudyDay(from: number, days: readonly number[], strict: boolean): number {
  let day = strict ? from + 1 : from;
  for (let i = 0; i < 7; i += 1) {
    if (days.includes(isoWeekdayOfDayNumber(day))) return day;
    day += 1;
  }
  return day;
}

function backwardStudyDay(from: number, days: readonly number[]): number {
  let day = from - 1;
  for (let i = 0; i < 7; i += 1) {
    if (days.includes(isoWeekdayOfDayNumber(day))) return day;
    day -= 1;
  }
  return day;
}

/** `effectiveAnchor` (be.md §5.3): `anchorDate` nếu ĐÚNG thứ học, không thì dời tới ngày học đầu tiên SAU đó. */
function effectiveAnchorDayNumber(anchor: RoadmapScheduleAnchor): number | null {
  const days = normalizedStudyDays(anchor.studyDays);
  if (days.length === 0) return null;
  const zoned = toZoned(anchor.anchorDate, anchor.timezone);
  return zoned ? forwardStudyDay(dayNumber(zoned), days, false) : null;
}

/** `k`-th ngày học tính từ `base` (`k` âm = lùi về trước, `k = 0` = chính `base`) — be.md §5.3. */
function addStudyDays(base: number, k: number, days: readonly number[]): number {
  let day = base;
  let remaining = Math.abs(k);
  while (remaining > 0) {
    day = k > 0 ? forwardStudyDay(day, days, true) : backwardStudyDay(day, days);
    remaining -= 1;
  }
  return day;
}

function dayNumberToApiDate(day: number): string {
  const date = new Date(day * MS_PER_DAY);
  const y = String(date.getUTCFullYear());
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function plannedDayNumber(anchor: RoadmapScheduleAnchor, lessonNumber: number): number | null {
  const days = normalizedStudyDays(anchor.studyDays);
  const base = effectiveAnchorDayNumber(anchor);
  if (base === null || days.length === 0) return null;
  return addStudyDays(base, lessonNumber - anchor.anchorNumber, days);
}

/**
 * Ngày dự kiến (`YYYY-MM-DD`) của buổi `lessonNumber`. `null` khi `studyDays` rỗng hoặc `anchorDate` không hợp lệ.
 * RM-08: bắt đầu Thứ 2 29/09 học T2+T5 ⇒ B01 = 29/09, B02 = 02/10, B09 = 27/10.
 */
export function plannedDateForLesson(
  anchor: RoadmapScheduleAnchor,
  lessonNumber: number,
): string | null {
  const day = plannedDayNumber(anchor, lessonNumber);
  return day === null ? null : dayNumberToApiDate(day);
}

/** Số buổi BẮT BUỘC (`!optional`) chưa xong có ngày dự kiến < hôm nay theo `timezone` — be.md §5.3. */
export function countBehindLessons(
  anchor: RoadmapScheduleAnchor,
  lessons: readonly { number: number; optional: boolean; done: boolean }[],
  now: DateLike = Date.now(),
): number {
  const today = toZoned(now, anchor.timezone);
  if (!today) return 0;
  const todayDayNumber = dayNumber(today);
  let behind = 0;
  for (const lesson of lessons) {
    if (lesson.optional || lesson.done) continue;
    const day = plannedDayNumber(anchor, lesson.number);
    if (day !== null && day < todayDayNumber) behind += 1;
  }
  return behind;
}
