import { VersionConflictError } from "../../../core/exceptions";
import type { AuthUser } from "../../../core/types/express";
import type { RoadmapEnrollment, RoadmapEnrollmentPatch } from "../entities/enrollment.interface";
import type { RoadmapSubject } from "../entities/subject.interface";
import { roadmapErrors } from "../roadmap.errors";
import { buildEnrollmentPlan, type EnrollmentPlan } from "./enrollment-plan";
import type { RoadmapDeps } from "./roadmap.deps";
import { nextStudyDateKey, toAnchorDate } from "./roadmap-schedule";
import { toEnrollmentDto, type EnrollmentDto, type TodayItemDto } from "./roadmap.presenter";

/** Số lần ghi lại khi CAS hụt vì một `PUT progress` chen giữa (bộ đếm tăng `version`) — chỉ cho thao tác không cần `expectedVersion`. */
const RESCHEDULE_ATTEMPTS = 2;

/** Đăng ký lộ trình, đổi nhịp học · tạm dừng, dời lịch, "Hôm nay học gì" (be.md §4–§5.3). */
export class EnrollmentService {
  constructor(private readonly d: Pick<RoadmapDeps, "subjects" | "lessons" | "enrollments" | "progress">) {}

  async enroll(user: AuthUser, subjectId: string, startDate: string, studyDays: number[]): Promise<EnrollmentDto> {
    const subject = await this.d.subjects.findById(subjectId);
    if (!subject || subject.status !== "PUBLISHED") throw roadmapErrors.notFound();
    const existing = await this.d.enrollments.findByUserAndSubject(user.id, subjectId);
    if (existing) throw roadmapErrors.enrollmentState("Bạn đã đăng ký lộ trình này");
    if (subject.requiredLessonCount === 0) throw roadmapErrors.noPublishedLessons();

    const timezone = "Asia/Ho_Chi_Minh";
    const enrollment = await this.d.enrollments.create({
      userId: user.id,
      subjectId,
      anchorDate: toAnchorDate(startDate, timezone),
      anchorNumber: 1,
      studyDays,
      timezone,
    });
    return toEnrollmentDto(enrollment);
  }

  /**
   * Đổi thứ học và/hoặc tạm dừng · tiếp tục. Đổi `studyDays` hoặc tiếp tục từ `PAUSED` ⇒ lập lại lịch từ buổi chưa qua kế
   * tiếp tại ngày học gần nhất ≥ hôm nay (be.md §5.3). Giữ nguyên `anchorNumber` cũ thì buổi ĐÃ học vẫn chiếm chỗ trên
   * lịch mới (buổi 1 rơi vào hôm nay dù đã học tới buổi 6), còn tạm dừng xong mà không dời thì vừa quay lại đã "trễ".
   */
  async patch(user: AuthUser, enrollmentId: string, expectedVersion: number, patch: { studyDays?: number[]; status?: "ACTIVE" | "PAUSED" }): Promise<EnrollmentDto> {
    const enrollment = await this.findOwn(user, enrollmentId);
    if (enrollment.status === "COMPLETED") throw roadmapErrors.enrollmentState("Lộ trình này đã hoàn thành");

    const studyDays = patch.studyDays ?? enrollment.studyDays;
    const daysChanged = patch.studyDays !== undefined && !sameDays(patch.studyDays, enrollment.studyDays);
    const resumed = patch.status === "ACTIVE" && enrollment.status === "PAUSED";
    const anchor = daysChanged || resumed ? await this.reanchor(enrollment, studyDays) : {};

    const updated = await this.d.enrollments.updateIf(enrollmentId, expectedVersion, { ...patch, ...anchor });
    if (!updated) throw await this.conflict(enrollmentId);
    return toEnrollmentDto(updated);
  }

  /**
   * "Dời lịch" (be.md §5.3, P1): buổi bắt buộc chưa qua nhỏ nhất xếp vào ngày học gần nhất ≥ hôm nay, các buổi sau nối
   * tiếp theo nhịp học; đang tạm dừng thì tiếp tục luôn. Không nhận `expectedVersion` (be.md §4 — không body): kết quả chỉ
   * phụ thuộc tiến độ hiện tại nên CAS theo bản vừa đọc, hụt vì ghi chen giữa thì đọc lại và thử thêm một lần.
   */
  async reschedule(user: AuthUser, enrollmentId: string): Promise<EnrollmentDto> {
    for (let attempt = 0; attempt < RESCHEDULE_ATTEMPTS; attempt++) {
      const enrollment = await this.findOwn(user, enrollmentId);
      if (enrollment.status === "COMPLETED") throw roadmapErrors.enrollmentState("Lộ trình này đã hoàn thành");
      const anchor = await this.reanchor(enrollment, enrollment.studyDays);
      const updated = await this.d.enrollments.updateIf(enrollmentId, enrollment.version, { ...anchor, status: "ACTIVE" });
      if (updated) return toEnrollmentDto(updated);
    }
    throw await this.conflict(enrollmentId);
  }

  /** Buổi bắt buộc chưa qua kế tiếp của MỌI lộ trình đang ACTIVE — thẻ "Hôm nay học gì" (app.md §3). */
  async today(user: AuthUser): Promise<TodayItemDto[]> {
    const enrollments = await this.d.enrollments.listActiveByUser(user.id);
    const loaded = await Promise.all(enrollments.map((e) => this.loadPlan(e)));
    const items: TodayItemDto[] = [];
    for (const entry of loaded) {
      const next = entry?.plan.nextRequired;
      if (!entry || !next || entry.subject.status !== "PUBLISHED") continue;
      const { subject, plan } = entry;
      items.push({
        subject: { id: subject.id, slug: subject.slug, title: subject.title, color: subject.color, icon: subject.icon, lessonLabel: subject.lessonLabel },
        lesson: { id: next.id, number: next.number, title: next.title },
        plannedDate: plan.dates.get(next.number) ?? plan.todayKey,
        behind: plan.behind,
      });
    }
    return items;
  }

  /** Mốc lịch mới: buổi bắt buộc chưa qua nhỏ nhất (hết thì buổi chưa qua bất kỳ) tại ngày học gần nhất ≥ hôm nay; không còn buổi nào ⇒ giữ mốc. */
  private async reanchor(enrollment: RoadmapEnrollment, studyDays: readonly number[]): Promise<RoadmapEnrollmentPatch> {
    const loaded = await this.loadPlan(enrollment);
    const anchor = loaded ? (loaded.plan.nextRequired ?? loaded.plan.firstPending) : null;
    if (!loaded || !anchor) return {};
    const anchorKey = nextStudyDateKey(loaded.plan.todayKey, studyDays);
    return { anchorNumber: anchor.number, anchorDate: toAnchorDate(anchorKey, enrollment.timezone), rescheduledAt: new Date() };
  }

  private async loadPlan(enrollment: RoadmapEnrollment): Promise<{ subject: RoadmapSubject; plan: EnrollmentPlan } | null> {
    const subject = await this.d.subjects.findById(enrollment.subjectId);
    if (!subject) return null;
    const [lessons, progress] = await Promise.all([
      this.d.lessons.list({ subjectId: subject.id, publishedOnly: true }),
      this.d.progress.listBySubject(enrollment.userId, subject.id),
    ]);
    return { subject, plan: buildEnrollmentPlan({ enrollment, lessons, progress, sequential: subject.unlockMode === "SEQUENTIAL" }) };
  }

  private async findOwn(user: AuthUser, enrollmentId: string): Promise<RoadmapEnrollment> {
    const enrollment = await this.d.enrollments.findById(enrollmentId);
    if (!enrollment || enrollment.userId !== user.id) throw roadmapErrors.notFound();
    return enrollment;
  }

  private async conflict(enrollmentId: string): Promise<Error> {
    const current = await this.d.enrollments.findById(enrollmentId);
    return current ? new VersionConflictError(current.version) : roadmapErrors.notFound();
  }
}

function sameDays(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((d) => b.includes(d));
}
