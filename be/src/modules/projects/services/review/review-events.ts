import type { OutboxEventInput } from "../../../../infrastructure/queue/outbox/outbox.types";
import {
  DOMAIN_EVENTS,
  eventKeys,
  reviewAssignedSchema,
  reviewCancelledSchema,
  reviewRoundClosedSchema,
  reviewShortageSchema,
  type ReviewAssignedPayload,
  type ReviewCancelledPayload,
  type ReviewRoundClosedPayload,
  type ReviewShortagePayload,
  type ReviewSubmittedPayload,
} from "../../../../shared/events/domain-events";
import type { TaskReview, TaskReviewRound } from "../../entities/task-review.interface";

/**
 * Dựng hàng outbox của chấm chéo (p4-05 be.md §7). Bốn sự kiện `review.assigned|round-closed|cancelled|shortage` đi vào MỘT job
 * `notifications/review.events` (mẫu `task.events`: mỗi cặp queue/jobName chỉ có MỘT processor); `review.submitted` là hai dòng RIÊNG
 * cho hai consumer đã có (`gamification/xp.consume` p4-03, `reports/contribution.review-fact` p4-06) vì `dedupeKey` outbox là unique.
 * Payload KHÔNG chứa điểm/nhận xét (chỉ `score10` ở `review.submitted` — thang chung cho XP/đóng góp).
 */
export const REVIEW_EVENT_QUEUE = "notifications" as const;
export const REVIEW_EVENT_JOB = "review.events" as const;
export const REVIEW_MEMBERSHIP_QUEUE = "reports" as const;
export const REVIEW_MEMBERSHIP_JOB = "review.membership" as const;
export const REVIEW_BACKFILL_QUEUE = "reports" as const;
export const REVIEW_BACKFILL_JOB = "review.backfill" as const;
export const REVIEW_REMINDER_QUEUE = "notifications" as const;
export const REVIEW_REMINDER_JOB = "review.reminder" as const;

export type ReviewEventPayload = ReviewAssignedPayload | ReviewRoundClosedPayload | ReviewCancelledPayload | ReviewShortagePayload;

/** Đọc payload job `review.events` (đã qua outbox/BullMQ): sai dạng ⇒ `null` (retry không làm nó đúng lên — processor bỏ qua có log). */
export function parseReviewEvent(data: unknown): ReviewEventPayload | null {
  const event = (data as { event?: unknown } | null)?.event;
  const schema =
    event === DOMAIN_EVENTS.REVIEW_ASSIGNED
      ? reviewAssignedSchema
      : event === DOMAIN_EVENTS.REVIEW_ROUND_CLOSED
        ? reviewRoundClosedSchema
        : event === DOMAIN_EVENTS.REVIEW_CANCELLED
          ? reviewCancelledSchema
          : event === DOMAIN_EVENTS.REVIEW_SHORTAGE
            ? reviewShortageSchema
            : null;
  if (!schema) return null;
  const parsed = schema.safeParse(data);
  return parsed.success ? (parsed.data as ReviewEventPayload) : null;
}

const eventRow = (payload: ReviewEventPayload, round: Pick<TaskReviewRound, "id">, dedupeKey: string): OutboxEventInput => ({
  type: payload.event,
  aggregateType: "TaskReviewRound",
  aggregateId: round.id,
  queue: REVIEW_EVENT_QUEUE,
  jobName: REVIEW_EVENT_JOB,
  dedupeKey,
  payload: payload as unknown as Record<string, unknown>,
});

const base = (round: TaskReviewRound) => ({
  roundId: round.id,
  taskId: round.taskId,
  boardId: round.boardId,
  workspaceId: round.workspaceId,
  round: round.round,
});

const refs = (reviews: readonly TaskReview[]) => reviews.map((r) => ({ reviewId: r.id, reviewerId: r.reviewerId }));

/** Mở lượt (`ROUND_OPENED`, dedupe theo lượt) hoặc giao lại MỘT người (`REASSIGNED`, dedupe thêm `:r<reviewId>`). */
export function assignedRow(round: TaskReviewRound, reviews: readonly TaskReview[], cause: ReviewAssignedPayload["cause"]): OutboxEventInput {
  const payload: ReviewAssignedPayload = { event: DOMAIN_EVENTS.REVIEW_ASSIGNED, ...base(round), reviews: refs(reviews), cause };
  return eventRow(payload, round, eventKeys.reviewAssigned(round.id, cause === "REASSIGNED" ? reviews[0]?.id : undefined));
}

export function roundClosedRow(round: TaskReviewRound, status: ReviewRoundClosedPayload["status"], assigneeIds: string[], actorId: string | null): OutboxEventInput {
  const payload: ReviewRoundClosedPayload = {
    event: DOMAIN_EVENTS.REVIEW_ROUND_CLOSED,
    ...base(round),
    status,
    autoApproved: round.autoApproved,
    assigneeIds,
    actorId,
  };
  return eventRow(payload, round, eventKeys.reviewRoundClosed(round.id));
}

/** Huỷ cả lượt (`scope: "ROUND"`, dedupe theo lượt) hoặc MỘT lượt chấm bị giao lại thủ công (dedupe theo review). */
export function cancelledRow(
  round: TaskReviewRound,
  reviews: readonly TaskReview[],
  reason: ReviewCancelledPayload["reason"],
  scope: "ROUND" | "REVIEW" = "ROUND"
): OutboxEventInput {
  const payload: ReviewCancelledPayload = { event: DOMAIN_EVENTS.REVIEW_CANCELLED, ...base(round), reviews: refs(reviews), reason };
  const key = scope === "ROUND" ? eventKeys.reviewCancelled({ roundId: round.id }) : eventKeys.reviewCancelled({ reviewId: reviews[0]?.id ?? round.id });
  return eventRow(payload, round, key);
}

/** `round.version` (sau khi ghi) nằm trong dedupeKey: mỗi lần `requiredReviews` giảm thêm là một thông báo mới. */
export function shortageRow(round: TaskReviewRound): OutboxEventInput {
  const payload: ReviewShortagePayload = {
    event: DOMAIN_EVENTS.REVIEW_SHORTAGE,
    ...base(round),
    requiredReviews: round.requiredReviews,
    configuredReviews: round.configuredReviews,
    autoApproved: round.autoApproved,
  };
  return eventRow(payload, round, eventKeys.reviewShortage(round.id, round.version));
}

/** Hai dòng RIÊNG cùng payload `review.submitted` (XP p4-03 + đóng góp p4-06). Không sửa chấm sau khi nộp nên `reviewId` là khoá idempotent. */
export function submittedRows(review: TaskReview, round: TaskReviewRound, assigneeIds: string[]): OutboxEventInput[] {
  const payload: ReviewSubmittedPayload = {
    event: DOMAIN_EVENTS.REVIEW_SUBMITTED,
    reviewId: review.id,
    taskId: review.taskId,
    boardId: review.boardId,
    workspaceId: review.workspaceId,
    roundId: round.id,
    reviewerId: review.reviewerId,
    assigneeIds,
    status: review.status,
    ...(review.score10 !== null && { score10: review.score10 }),
    ...(review.submittedAt && { submittedAt: review.submittedAt.toISOString() }),
  };
  const common = { type: DOMAIN_EVENTS.REVIEW_SUBMITTED, aggregateType: "TaskReview", aggregateId: review.id, payload: payload as unknown as Record<string, unknown> };
  return [
    { ...common, queue: "gamification", jobName: "xp.consume", dedupeKey: eventKeys.reviewSubmitted(review.id) },
    { ...common, queue: "reports", jobName: "contribution.review-fact", dedupeKey: eventKeys.contributionReviewFact(review.id) },
  ];
}

/**
 * Dòng outbox `reports/review.backfill` mode `SYNC` — `PUT /boards/:id/columns` đổi `kind` cột CÓ thẻ sang/khỏi REVIEW: job mở lượt cho thẻ mới vào cột REVIEW (bảng bật
 * chấm chéo) và đóng lượt của thẻ không còn ở REVIEW. `dedupeKey` theo version bảng (mỗi lần ghi cột tăng version nên không trùng).
 */
export function reviewSyncRow(boardId: string, boardVersion: number): OutboxEventInput {
  return {
    type: "review.backfill",
    aggregateType: "Board",
    aggregateId: boardId,
    queue: REVIEW_BACKFILL_QUEUE,
    jobName: REVIEW_BACKFILL_JOB,
    dedupeKey: eventKeys.reviewBackfill(boardId, boardVersion),
    payload: { boardId, version: boardVersion, mode: "SYNC" },
  };
}

/** Job `review.membership` — đối soát người chấm không còn hợp lệ sau khi mất quyền/rời nhóm (xem `review-membership.job.ts`). */
export interface ReviewMembershipJob {
  workspaceId: string;
  userIds: string[];
}
