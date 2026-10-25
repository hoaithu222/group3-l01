import type { NotifyInput } from "../../notifications/public";
import type { RoadmapEnrollment } from "../entities/enrollment.interface";
import { ROADMAP_NOTIFICATION_TYPES } from "../notifications/roadmap.notification-types";
import { buildEnrollmentPlan } from "./enrollment-plan";
import { isOverdue } from "./roadmap-schedule";
import type { RoadmapDeps } from "./roadmap.deps";

export type SendNotification = (input: NotifyInput) => Promise<void>;

export interface RoadmapReminderResult {
  usersReminded: number;
}

interface DueLesson {
  subjectId: string;
  lessonId: string;
  lessonNumber: number;
  /** Ngày hôm nay (`YYYY-MM-DD`) theo múi giờ ĐĂNG KÝ — cũng là hậu tố khoá dedupe (1 push/người/ngày). */
  todayKey: string;
}

/**
 * Nhắc học hằng ngày (p4-07 be.md §7, RM-15 P1 — cron `roadmap.remind-today` 07:30, retry 3). Mirror
 * `modules/moderation/services/stale-report-reminder.service.ts` (dedupe theo ngày) — khác ở chỗ `notify()` (p1-07) nay
 * đã IDEMPOTENT theo `dedupeKey`/`(recipient, source.id)` nên KHÔNG cần tự kiểm tồn tại trước khi gửi.
 *
 * "Buổi đến hạn" = buổi bắt buộc chưa qua kế tiếp (`EnrollmentPlan.nextRequired`, cùng định nghĩa với `EnrollmentService.today()`)
 * có ngày dự kiến <= hôm nay (đúng hạn hôm nay hoặc đã trễ — phối hợp với `EnrollmentPlan.behind` của RM-15/dời lịch). Người
 * học có nhiều lộ trình cùng đến hạn chỉ nhận MỘT push (lộ trình đầu tiên tìm thấy) — "1 push/người/ngày" (be.md §7).
 */
export class RoadmapReminderService {
  constructor(
    private readonly d: Pick<RoadmapDeps, "subjects" | "lessons" | "enrollments" | "progress">,
    private readonly send: SendNotification
  ) {}

  async run(): Promise<RoadmapReminderResult> {
    const enrollments = await this.d.enrollments.listAllActive();
    const byUser = new Map<string, RoadmapEnrollment[]>();
    for (const e of enrollments) {
      const list = byUser.get(e.userId);
      if (list) list.push(e);
      else byUser.set(e.userId, [e]);
    }

    let usersReminded = 0;
    for (const [userId, own] of byUser) {
      const due = await this.firstDueToday(own);
      if (!due) continue;
      await this.remind(userId, due);
      usersReminded += 1;
    }
    return { usersReminded };
  }

  private async firstDueToday(enrollments: readonly RoadmapEnrollment[]): Promise<DueLesson | null> {
    for (const enrollment of enrollments) {
      const subject = await this.d.subjects.findById(enrollment.subjectId);
      if (!subject || subject.status !== "PUBLISHED") continue;
      const [lessons, progress] = await Promise.all([
        this.d.lessons.list({ subjectId: subject.id, publishedOnly: true }),
        this.d.progress.listBySubject(enrollment.userId, subject.id),
      ]);
      const plan = buildEnrollmentPlan({ enrollment, lessons, progress, sequential: subject.unlockMode === "SEQUENTIAL" });
      const next = plan.nextRequired;
      if (!next) continue;
      const dueDate = plan.dates.get(next.number) ?? plan.todayKey;
      if (dueDate === plan.todayKey || isOverdue(dueDate, plan.todayKey)) {
        return { subjectId: subject.id, lessonId: next.id, lessonNumber: next.number, todayKey: plan.todayKey };
      }
    }
    return null;
  }

  private async remind(userId: string, due: DueLesson): Promise<void> {
    const dedupeKey = `roadmap.lesson-due-reminder:user:${userId}:${due.todayKey}`;
    await this.send({
      type: ROADMAP_NOTIFICATION_TYPES.LESSON_DUE_REMINDER,
      scope: null,
      source: { type: "RoadmapReminder", id: dedupeKey },
      refs: { lessonId: due.lessonId, subjectId: due.subjectId, lessonNumber: due.lessonNumber },
      recipients: [{ userId }],
      dedupeKey,
    });
  }
}
