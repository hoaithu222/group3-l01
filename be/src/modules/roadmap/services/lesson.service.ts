import type { AuthUser } from "../../../core/types/express";
import { DOMAIN_EVENTS, eventKeys, type RoadmapLessonCompletedPayload } from "../../../shared/events/domain-events";
import type { StudyContentReader } from "../../study/public";
import { roadmapErrors } from "../roadmap.errors";
import { markdownToBlocks } from "./content/md-to-blocks";
import { needsBlocksUpgrade, upgradeLessonBlocks } from "./content/upgrade-blocks";
import type { RoadmapDeps } from "./roadmap.deps";
import {
  toChecklistDto,
  toEnrollmentProgressDto,
  toMediaDto,
  toPracticeSetSummary,
  toProgressDto,
  toResourceDto,
  type EnrollmentProgressDto,
  type LessonDto,
  type MediaDto,
  type PracticeSetSummaryDto,
  type ProgressDto,
} from "./roadmap.presenter";

/** Buổi học + tiến độ NGƯỜI HỌC — GET .../lessons/:id, GET .../media, PUT .../progress (be.md §4–§5.4). */
export class LessonService {
  constructor(
    private readonly d: Pick<RoadmapDeps, "subjects" | "phases" | "lessons" | "media" | "progress" | "enrollments" | "tx" | "outbox">,
    private readonly studyContent: StudyContentReader
  ) {}

  async getLesson(user: AuthUser, lessonId: string): Promise<LessonDto> {
    const lesson = await this.d.lessons.findById(lessonId);
    if (!lesson || !lesson.published) throw roadmapErrors.notFound();
    const subject = await this.d.subjects.findById(lesson.subjectId);
    if (!subject || subject.status !== "PUBLISHED") throw roadmapErrors.notFound();

    const siblings = await this.d.lessons.list({ subjectId: subject.id, publishedOnly: true });
    const required = siblings.filter((l) => !l.optional).sort((a, b) => a.number - b.number);

    if (subject.unlockMode === "SEQUENTIAL") {
      const priorRequired = required.filter((l) => l.number < lesson.number);
      if (priorRequired.length > 0) {
        const rows = await this.d.progress.listBySubject(user.id, subject.id);
        const done = new Set(rows.filter((r) => r.status === "COMPLETED").map((r) => r.lessonId));
        if (priorRequired.some((l) => !done.has(l.id))) throw roadmapErrors.lessonLocked();
      }
    }

    const prev = siblings.filter((l) => l.number < lesson.number).sort((a, b) => b.number - a.number)[0] ?? null;
    const next = siblings.filter((l) => l.number > lesson.number).sort((a, b) => a.number - b.number)[0] ?? null;

    const [progress, practiceSets, phase] = await Promise.all([
      this.d.progress.findByUserAndLesson(user.id, lessonId),
      this.loadPracticeSets(user, lesson.practiceSetIds),
      this.d.phases.findById(lesson.phaseId),
    ]);

    // Buổi dựng `blocks` bằng pipeline cũ ⇒ dựng lại từ `bodyMd` (ảnh mockup hiện tại chỗ, chữ hết `&lt;`) — `upgrade-blocks.ts`.
    const blocks = needsBlocksUpgrade(lesson) ? upgradeLessonBlocks(lesson, await this.d.media.listByLesson(lesson.id)) : lesson.blocks;

    return {
      id: lesson.id,
      subjectId: lesson.subjectId,
      phaseId: lesson.phaseId,
      lessonLabel: subject.lessonLabel,
      phaseTitle: phase?.title ?? "",
      slug: lesson.slug,
      number: lesson.number,
      title: lesson.title,
      summary: lesson.summary,
      durationMinutes: lesson.durationMinutes,
      prerequisites: lesson.prerequisites,
      objectives: lesson.objectives,
      blocks,
      checklist: lesson.checklist.map(toChecklistDto),
      resources: lesson.resources.map((r) => toResourceDto(r, r.kind === "NOTE" && r.bodyMd ? markdownToBlocks(r.bodyMd, new Map(), []) : null)),
      practiceSets,
      optional: lesson.optional,
      mediaCount: lesson.mediaCount,
      version: lesson.version,
      prev: prev ? { id: prev.id, number: prev.number, title: prev.title } : null,
      next: next ? { id: next.id, number: next.number, title: next.title } : null,
      myProgress: progress ? toProgressDto(progress) : null,
    };
  }

  async listMedia(lessonId: string): Promise<MediaDto[]> {
    const lesson = await this.d.lessons.findById(lessonId);
    if (!lesson || !lesson.published) throw roadmapErrors.notFound();
    const media = await this.d.media.listByLesson(lessonId);
    return media.map(toMediaDto);
  }

  async putProgress(user: AuthUser, lessonId: string, patch: { status?: string; checkedItemIds?: string[]; selfRating?: number | null; note?: string | null }): Promise<{ progress: ProgressDto; enrollment: EnrollmentProgressDto }> {
    const lesson = await this.d.lessons.findById(lessonId);
    if (!lesson || !lesson.published) throw roadmapErrors.notFound();
    if (patch.checkedItemIds) {
      const valid = new Set(lesson.checklist.map((c) => c.id));
      if (patch.checkedItemIds.some((id) => !valid.has(id))) throw roadmapErrors.unknownChecklistItem();
    }

    const [existing, subject, enrollmentBefore] = await Promise.all([
      this.d.progress.findByUserAndLesson(user.id, lessonId),
      this.d.subjects.findById(lesson.subjectId),
      this.d.enrollments.findByUserAndSubject(user.id, lesson.subjectId),
    ]);
    const wasCompleted = existing?.status === "COMPLETED";
    const nowStatus = patch.status ?? existing?.status ?? "NOT_STARTED";
    const becameCompleted = !wasCompleted && nowStatus === "COMPLETED";
    const becameUncompleted = wasCompleted && nowStatus !== "COMPLETED";

    // RM-14 (p4-07 be.md §5.4): progress.upsert + incrementCounts + outbox XP CÙNG một transaction — buổi CHUYỂN sang
    // COMPLETED lần đầu mất outbox = mất XP vĩnh viễn (không có đường quét bù như cron).
    const saved = await this.d.tx.run(async (tx) => {
      const row = await this.d.progress.upsert(
        user.id,
        lesson.subjectId,
        lessonId,
        null,
        {
          status: nowStatus as never,
          checkedItemIds: patch.checkedItemIds ?? existing?.checkedItemIds ?? [],
          selfRating: patch.selfRating !== undefined ? patch.selfRating : (existing?.selfRating ?? null),
          note: patch.note !== undefined ? patch.note : (existing?.note ?? null),
          startedAt: existing?.startedAt ?? (nowStatus !== "NOT_STARTED" ? new Date() : null),
          completedAt: nowStatus === "COMPLETED" ? (existing?.completedAt ?? new Date()) : null,
        },
        tx
      );

      if (enrollmentBefore) {
        if (becameCompleted || becameUncompleted) {
          const delta = becameCompleted ? 1 : -1;
          await this.d.enrollments.incrementCounts(enrollmentBefore.id, { completed: delta, required: lesson.optional ? 0 : delta }, lessonId, subject?.requiredLessonCount ?? 0, tx);
        } else {
          await this.d.enrollments.touchActivity(enrollmentBefore.id, lessonId, tx);
        }
      }

      if (becameCompleted) {
        const payload: RoadmapLessonCompletedPayload = {
          event: DOMAIN_EVENTS.ROADMAP_LESSON_COMPLETED,
          userId: user.id,
          lessonId,
          subjectId: lesson.subjectId,
          completedAt: (row.completedAt ?? new Date()).toISOString(),
        };
        await this.d.outbox.add(tx, {
          type: DOMAIN_EVENTS.ROADMAP_LESSON_COMPLETED,
          aggregateType: "RoadmapLessonProgress",
          aggregateId: row.id,
          queue: "gamification",
          jobName: "xp.consume",
          dedupeKey: eventKeys.roadmapLessonCompleted(user.id, lessonId),
          payload: payload as unknown as Record<string, unknown>,
        });
      }

      return row;
    });

    const enrollment = enrollmentBefore ? await this.d.enrollments.findById(enrollmentBefore.id) : null;
    const enrollmentProgress = toEnrollmentProgressDto(enrollment?.completedCount ?? 0, enrollment?.requiredDone ?? 0, subject?.requiredLessonCount ?? 0);
    return { progress: toProgressDto(saved), enrollment: enrollmentProgress };
  }

  /** Bộ luyện tập người học ĐỌC được (`canView`) theo đúng thứ tự admin gắn; bộ đã ẩn/xoá/không có quyền bị bỏ qua lặng lẽ. */
  private async loadPracticeSets(user: AuthUser, ids: readonly string[]): Promise<PracticeSetSummaryDto[]> {
    if (ids.length === 0) return [];
    const sets = await Promise.all(
      [...new Set(ids)].map(async (id) => {
        try {
          return toPracticeSetSummary(await this.studyContent.getViewableSet(user, id));
        } catch {
          return null;
        }
      })
    );
    return sets.filter((s): s is PracticeSetSummaryDto => s !== null);
  }
}
