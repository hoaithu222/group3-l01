import { LIMITS } from "../../../core/constants/limits";
import type { QuizScoredPayload, ReviewSubmittedPayload, RoadmapLessonCompletedPayload, SrReviewedPayload, StudySetPublishedPayload } from "../../../shared/events/domain-events";
import type { StoredCounterKey, XpSourceTypeValue } from "../entities/gamification.interface";

/**
 * Sự kiện miền → các "lần ghi nhận" XP (p4-03 be.md §5.1) — HÀM THUẦN. Mỗi `XpInput` = MỘT `XpEvent` idempotent theo
 * `(sourceType, sourceId, userId)` với `sourceId` là THỰC THỂ NGUỒN (taskId, attemptId, `<itemId>:<ngày ôn>`…), KHÔNG phải `dedupeKey` outbox.
 */
export interface XpInput {
  userId: string;
  sourceType: XpSourceTypeValue;
  sourceId: string;
  occurredAt: Date;
  workspaceId: string | null;
  /** Hệ số nhân `rule.xp` (story points, scorePct/100…). */
  factor: number;
  /** Counter tăng khi ghi nhận LẦN ĐẦU (kể cả khi XP bị chặn/vượt trần — GM-02). */
  counters: Partial<Record<StoredCounterKey, number>>;
  /** Chống farm: thẻ tạo lúc nào (`completedAt − taskCreatedAt < minTaskAgeSec` → XP 0). */
  taskCreatedAt?: Date;
}

/** Trường tối thiểu của `task.completed` mà mapper dùng (khớp `TaskCompletedPayload` của p3-02, chỉ là kiểu cấu trúc — không import module projects). */
export interface TaskCompletedInput {
  taskId: string;
  workspaceId: string;
  assigneeIds: string[];
  storyPoints: number | null;
  completedAt: string;
  onTime: boolean;
  taskCreatedAt?: string;
}

const parseDate = (iso: string | undefined): Date | null => {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
};

const clamp = (n: number, lo: number, hi: number): number => Math.min(Math.max(n, lo), hi);

/** `task.completed`: mỗi người làm TẠI LÚC hoàn thành nhận `TASK_COMPLETED` (× story points ∈ [1, 5]) và, nếu đúng hạn, `TASK_ON_TIME`. */
export function mapTaskCompleted(p: TaskCompletedInput): XpInput[] {
  const at = parseDate(p.completedAt);
  if (!at || p.assigneeIds.length === 0) return [];
  const multiplier = clamp(Math.trunc(p.storyPoints ?? 1) || 1, 1, LIMITS.gamification.storyPointsMultiplierMax);
  const taskCreatedAt = parseDate(p.taskCreatedAt) ?? undefined;
  return [...new Set(p.assigneeIds)].flatMap((userId) => {
    const base = { userId, sourceId: p.taskId, occurredAt: at, workspaceId: p.workspaceId, taskCreatedAt };
    const done: XpInput = { ...base, sourceType: "TASK_COMPLETED", factor: multiplier, counters: { tasksDone: 1 } };
    return p.onTime ? [done, { ...base, sourceType: "TASK_ON_TIME", factor: 1, counters: { tasksOnTime: 1 } }] : [done];
  });
}

/** `quiz.scored`: `QUIZ_SCORED` (× scorePct/100; đếm lượt + điểm cao ≥ 90) và, khi đạt, `QUIZ_PASSED`. */
export function mapQuizScored(p: QuizScoredPayload): XpInput[] {
  const at = parseDate(p.submittedAt);
  if (!at) return [];
  const base = { userId: p.userId, sourceId: p.attemptId, occurredAt: at, workspaceId: null };
  const scored: XpInput = { ...base, sourceType: "QUIZ_SCORED", factor: p.scorePct / 100, counters: { quizzesTaken: 1, ...(p.scorePct >= 90 && { quizHighScores: 1 }) } };
  return p.passed ? [scored, { ...base, sourceType: "QUIZ_PASSED", factor: 1, counters: { quizzesPassed: 1 } }] : [scored];
}

/**
 * `sr.reviewed`: `SR_REVIEW` (đếm `srReviews`; `sourceId <itemId>:<ngày>`) + `SR_REVIEW_DAY` (một lần/ngày — `sourceId` là ngày, chính nó tăng
 * `srReviewDays` nên chỉ ngày MỚI mới đếm và mới cộng XP).
 */
export function mapSrReviewed(p: SrReviewedPayload): XpInput[] {
  const at = parseDate(p.reviewedAt);
  if (!at) return [];
  const base = { userId: p.userId, occurredAt: at, workspaceId: null, factor: 1 };
  return [
    { ...base, sourceType: "SR_REVIEW", sourceId: `${p.itemId}:${p.localDate}`, counters: { srReviews: 1 } },
    { ...base, sourceType: "SR_REVIEW_DAY", sourceId: p.localDate, counters: { srReviewDays: 1 } },
  ];
}

/** `review.submitted` (p4-05): người CHẤM nhận `REVIEW_SUBMITTED`. */
export function mapReviewSubmitted(p: ReviewSubmittedPayload): XpInput[] {
  const at = parseDate(p.submittedAt) ?? new Date();
  return [{ userId: p.reviewerId, sourceType: "REVIEW_SUBMITTED", sourceId: p.reviewId, occurredAt: at, workspaceId: p.workspaceId ?? null, factor: 1, counters: { reviewsGiven: 1 } }];
}

/** `study-set.published` (p4-01, tuỳ chọn): chủ bộ nhận `STUDY_SET_PUBLISHED` một lần cho mỗi bộ. */
export function mapStudySetPublished(p: StudySetPublishedPayload): XpInput[] {
  const at = parseDate(p.publishedAt);
  if (!at) return [];
  return [{ userId: p.ownerId, sourceType: "STUDY_SET_PUBLISHED", sourceId: p.setId, occurredAt: at, workspaceId: null, factor: 1, counters: { setsPublished: 1 } }];
}

/** `roadmap.lesson-completed` (p4-07, RM-14): buổi lộ trình hoàn thành LẦN ĐẦU nhận `ROADMAP_LESSON` (không nhân hệ số, không thuộc workspace nào). */
export function mapRoadmapLessonCompleted(p: RoadmapLessonCompletedPayload): XpInput[] {
  const at = parseDate(p.completedAt);
  if (!at) return [];
  return [{ userId: p.userId, sourceType: "ROADMAP_LESSON", sourceId: p.lessonId, occurredAt: at, workspaceId: null, factor: 1, counters: {} }];
}

/** `dedupeKey` của `XpEvent`: `<sourceType>:<sourceId>:<userId>`. */
export const xpDedupeKey = (input: Pick<XpInput, "sourceType" | "sourceId" | "userId">): string => `${input.sourceType}:${input.sourceId}:${input.userId}`;
