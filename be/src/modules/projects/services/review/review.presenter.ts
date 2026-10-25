import type {
  ReviewCancelReason,
  ReviewRoundStatusValue,
  RoundCloseReason,
  RubricCriterion,
  RubricScore,
  TaskReview,
  TaskReviewRound,
} from "../../entities/task-review.interface";
import type { UserSummary } from "../../repositories/project-directory.interface";
import { canSeeResults, visibilityOf, type MaskedReviewStatus, type ReviewViewer } from "./review-visibility";

/** Người chấm/người miễn chấm (đã rời hệ thống vẫn giữ chỗ với tên rỗng, như thẻ mini). */
export interface ReviewerDto {
  id: string;
  name: string;
  avatarUrl: string | null;
}

export interface TaskReviewDto {
  id: string;
  roundId: string;
  reviewer: ReviewerDto;
  /** `SUBMITTED` = đã nộp nhưng viewer chưa được xem quyết định (chỉ thấy "đã chấm"). */
  status: MaskedReviewStatus;
  assignedAt: string;
  submittedAt: string | null;
  /** Dùng làm `expectedVersion` khi nộp/giao lại. */
  version: number;
  /** CHỈ có khi `review-visibility` cho phép xem kết quả. */
  score10?: number | null;
  rubricScores?: RubricScore[];
  feedback?: string | null;
  cancelReason?: ReviewCancelReason | null;
}

export interface ReviewRoundDto {
  id: string;
  round: number;
  status: ReviewRoundStatusValue;
  requiredReviews: number;
  configuredReviews: number;
  assignedCount: number;
  approvedCount: number;
  shortage: boolean;
  /** Tự duyệt do nhóm không đủ người chấm. */
  autoApproved: boolean;
  waived: { by: ReviewerDto | null; reason: string } | null;
  rubric: RubricCriterion[];
  openedAt: string;
  closedAt: string | null;
  closeReason: RoundCloseReason | null;
  reviews: TaskReviewDto[];
}

const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);

export const reviewerOf = (id: string, users: ReadonlyMap<string, UserSummary>): ReviewerDto => users.get(id) ?? { id, name: "", avatarUrl: null };

/** Mọi id người cần tên để dựng các lượt (người chấm + người miễn chấm) — một lần tra cho cả trang. */
export function userIdsOf(rounds: readonly TaskReviewRound[], reviews: readonly TaskReview[]): string[] {
  const ids = new Set<string>(reviews.map((r) => r.reviewerId));
  for (const r of rounds) if (r.waivedBy) ids.add(r.waivedBy);
  return [...ids];
}

export function presentReview(review: TaskReview, users: ReadonlyMap<string, UserSummary>, visible: { status: MaskedReviewStatus; showResult: boolean }): TaskReviewDto {
  return {
    id: review.id,
    roundId: review.roundId,
    reviewer: reviewerOf(review.reviewerId, users),
    status: visible.status,
    assignedAt: review.assignedAt.toISOString(),
    submittedAt: iso(review.submittedAt),
    version: review.version,
    ...(visible.showResult && { score10: review.score10, rubricScores: review.rubricScores, feedback: review.feedback }),
    ...((review.status === "CANCELLED" || review.status === "REASSIGNED") && { cancelReason: review.cancelReason }),
  };
}

/** Một lượt kèm review, lọc theo QUAN HỆ của viewer với lượt (mỗi lượt tự quyết được xem kết quả hay không). */
export function presentRound(
  round: TaskReviewRound,
  reviews: readonly TaskReview[],
  users: ReadonlyMap<string, UserSummary>,
  viewer: ReviewViewer
): ReviewRoundDto {
  const own = reviews.filter((r) => r.roundId === round.id);
  const canSee = canSeeResults(viewer, round, own);
  return {
    id: round.id,
    round: round.round,
    status: round.status,
    requiredReviews: round.requiredReviews,
    configuredReviews: round.configuredReviews,
    assignedCount: round.assignedCount,
    approvedCount: round.approvedCount,
    shortage: round.shortage,
    autoApproved: round.autoApproved,
    waived: round.status === "WAIVED" ? { by: round.waivedBy ? reviewerOf(round.waivedBy, users) : null, reason: round.waiveReason ?? "" } : null,
    rubric: round.rubricSnapshot,
    openedAt: round.openedAt.toISOString(),
    closedAt: iso(round.closedAt),
    closeReason: round.closeReason,
    reviews: own.map((r) => presentReview(r, users, visibilityOf(viewer, canSee, r))),
  };
}
