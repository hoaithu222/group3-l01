import type { AuthUser } from "../../../core/types/express";
import type { RoadmapEnrollment } from "../entities/enrollment.interface";
import type { RoadmapSubject } from "../entities/subject.interface";
import { roadmapErrors } from "../roadmap.errors";
import { buildEnrollmentPlan } from "./enrollment-plan";
import type { RoadmapDeps } from "./roadmap.deps";
import { anchorDateKeyOf, scheduleMap } from "./roadmap-schedule";
import {
  toEnrollmentDto,
  toLessonSummary,
  toPhaseDto,
  toSubjectCard,
  type EnrollmentDto,
  type LessonSummaryDto,
  type MyEnrollmentSummaryDto,
  type PhaseDto,
  type SubjectCardDto,
} from "./roadmap.presenter";

export interface SubjectDetailDto {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  category: string;
  color: string | null;
  icon: string | null;
  coverAssetId: string | null;
  lessonLabel: string;
  defaultStudyDays: number[];
  unlockMode: string;
  phaseCount: number;
  lessonCount: number;
  requiredLessonCount: number;
  phases: PhaseDto[];
  lessons: LessonSummaryDto[];
  /** `lessonId → trạng thái`. Rỗng khi chưa đăng ký. */
  progress: Record<string, string>;
  /** `lessonId → YYYY-MM-DD`. Rỗng khi chưa đăng ký (không có `anchorDate` để tính). */
  schedule: Record<string, string>;
  myEnrollment: EnrollmentDto | null;
}

/** Danh sách/chi tiết môn học cho NGƯỜI HỌC — chỉ đọc, luôn qua `status: PUBLISHED` (be.md §4). */
export class SubjectQueryService {
  constructor(private readonly d: Pick<RoadmapDeps, "subjects" | "phases" | "lessons" | "enrollments" | "progress">) {}

  async list(user: AuthUser): Promise<SubjectCardDto[]> {
    const subjects = await this.d.subjects.list({ status: ["PUBLISHED"] });
    return Promise.all(
      subjects.map(async (s) => {
        const enrollment = await this.d.enrollments.findByUserAndSubject(user.id, s.id);
        return toSubjectCard(s, enrollment ? await this.summaryOf(user, s, enrollment) : null);
      })
    );
  }

  async detail(user: AuthUser, idOrSlug: string): Promise<SubjectDetailDto> {
    const subject = await this.d.subjects.findBySlugOrId(idOrSlug);
    if (!subject || subject.status !== "PUBLISHED") throw roadmapErrors.notFound();

    const [phases, lessons, enrollment, progressRows] = await Promise.all([
      this.d.phases.listBySubject(subject.id),
      this.d.lessons.list({ subjectId: subject.id, publishedOnly: true }),
      this.d.enrollments.findByUserAndSubject(user.id, subject.id),
      this.d.progress.listBySubject(user.id, subject.id),
    ]);

    const progress: Record<string, string> = {};
    for (const p of progressRows) progress[p.lessonId] = p.status;

    return {
      id: subject.id,
      slug: subject.slug,
      title: subject.title,
      description: subject.description,
      category: subject.category,
      color: subject.color,
      icon: subject.icon,
      coverAssetId: subject.coverAssetId,
      lessonLabel: subject.lessonLabel,
      defaultStudyDays: subject.defaultStudyDays,
      unlockMode: subject.unlockMode,
      phaseCount: subject.phaseCount,
      lessonCount: subject.lessonCount,
      requiredLessonCount: subject.requiredLessonCount,
      phases: phases.map(toPhaseDto),
      lessons: lessons.map(toLessonSummary),
      progress,
      schedule: enrollment ? buildSchedule(lessons, enrollment) : {},
      myEnrollment: enrollment ? toEnrollmentDto(enrollment) : null,
    };
  }

  /**
   * Tóm tắt đăng ký cho thẻ danh sách môn (be.md §4 `myEnrollment`): `nextLessonId`/`behind` theo tiến độ THẬT
   * (`enrollment-plan.ts`) — không phải buổi mở gần nhất (`lastLessonId`), cũng không suy từ bộ đếm `requiredDone`.
   */
  private async summaryOf(user: AuthUser, subject: RoadmapSubject, enrollment: RoadmapEnrollment): Promise<MyEnrollmentSummaryDto> {
    const [lessons, progress] = await Promise.all([this.d.lessons.list({ subjectId: subject.id, publishedOnly: true }), this.d.progress.listBySubject(user.id, subject.id)]);
    const plan = buildEnrollmentPlan({ enrollment, lessons, progress, sequential: subject.unlockMode === "SEQUENTIAL" });
    const percent = subject.requiredLessonCount > 0 ? Math.min(100, Math.round((enrollment.requiredDone / subject.requiredLessonCount) * 100)) : 0;
    return { status: enrollment.status, percent, nextLessonId: plan.nextRequired?.id ?? null, behind: plan.behind };
  }
}

function buildSchedule(lessons: readonly { id: string; number: number }[], enrollment: RoadmapEnrollment): Record<string, string> {
  const maxNumber = lessons.reduce((max, l) => Math.max(max, l.number), 0);
  const anchorKey = anchorDateKeyOf(enrollment.anchorDate, enrollment.timezone);
  const dates = scheduleMap(maxNumber, anchorKey, enrollment.anchorNumber, enrollment.studyDays);
  const out: Record<string, string> = {};
  for (const l of lessons) {
    const key = dates.get(l.number);
    if (key) out[l.id] = key;
  }
  return out;
}
