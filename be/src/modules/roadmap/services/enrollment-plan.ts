import type { RoadmapEnrollment, RoadmapLessonProgress } from "../entities/enrollment.interface";
import type { RoadmapLesson } from "../entities/lesson.interface";
import { anchorDateKeyOf, isOverdue, scheduleMap, todayKeyOf } from "./roadmap-schedule";

export type PlanLesson = Pick<RoadmapLesson, "id" | "number" | "title" | "optional">;

export interface EnrollmentPlan {
  /** Hôm nay (`YYYY-MM-DD`) theo múi giờ đăng ký. */
  todayKey: string;
  /** `lessonNumber → YYYY-MM-DD` theo mốc hiện tại của đăng ký (`scheduleMap`). */
  dates: Map<number, string>;
  /** Buổi BẮT BUỘC chưa qua có số nhỏ nhất — thẻ "Hôm nay học gì" và mốc "Dời lịch". */
  nextRequired: PlanLesson | null;
  /** Buổi chưa qua (kể cả tự chọn) có số nhỏ nhất — mốc dời lịch khi đã qua hết buổi bắt buộc. */
  firstPending: PlanLesson | null;
  /** Số buổi bắt buộc chưa qua mà ngày dự kiến đã trôi qua; luôn 0 khi đăng ký không `ACTIVE` (đang tạm dừng thì không "trễ"). */
  behind: number;
}

/**
 * "Đã qua" một buổi = hoàn thành (`COMPLETED`) hoặc chủ động bỏ qua (`SKIPPED`). Riêng môn `SEQUENTIAL`, bỏ qua buổi BẮT
 * BUỘC không mở khoá buổi sau (`LessonService.getLesson` chỉ tính `COMPLETED`) nên cũng không tính là đã qua — nhờ vậy
 * "Hôm nay học gì" không bao giờ trỏ vào một buổi đang bị khoá.
 */
export function isLessonPassed(status: string | undefined, lesson: Pick<RoadmapLesson, "optional">, sequential: boolean): boolean {
  if (status === "COMPLETED") return true;
  return status === "SKIPPED" && (!sequential || lesson.optional);
}

/**
 * Kế hoạch học THEO TIẾN ĐỘ THẬT (hàm thuần). Không suy "buổi kế tiếp" từ bộ đếm `requiredDone` như trước — đếm đúng
 * nhưng vị trí sai khi người học làm lệch thứ tự (xong buổi 1, 2, 5 ⇒ `required[3]` là buổi 5 đã xong, còn buổi 3 bị bỏ sót).
 */
export function buildEnrollmentPlan(input: {
  enrollment: Pick<RoadmapEnrollment, "status" | "anchorDate" | "anchorNumber" | "studyDays" | "timezone">;
  lessons: readonly PlanLesson[];
  progress: readonly Pick<RoadmapLessonProgress, "lessonId" | "status">[];
  sequential: boolean;
}): EnrollmentPlan {
  const { enrollment, sequential } = input;
  const lessons = [...input.lessons].sort((a, b) => a.number - b.number);
  const statusById = new Map(input.progress.map((p) => [p.lessonId, p.status]));
  const pending = lessons.filter((l) => !isLessonPassed(statusById.get(l.id), l, sequential));
  const pendingRequired = pending.filter((l) => !l.optional);

  const todayKey = todayKeyOf(enrollment.timezone);
  const maxNumber = lessons.length > 0 ? lessons[lessons.length - 1].number : 0;
  const dates = scheduleMap(maxNumber, anchorDateKeyOf(enrollment.anchorDate, enrollment.timezone), enrollment.anchorNumber, enrollment.studyDays);
  const behind = enrollment.status === "ACTIVE" ? pendingRequired.filter((l) => isOverdue(dates.get(l.number) ?? todayKey, todayKey)).length : 0;

  return { todayKey, dates, nextRequired: pendingRequired[0] ?? null, firstPending: pending[0] ?? null, behind };
}
