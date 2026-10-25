/**
 * DTO của p4-05 (chấm chéo) — VIẾT TAY theo `be.md` §3–§4 (đã đối chiếu `be/src/modules/projects/services/review/*`,
 * 2026-09-25) vì công cụ sinh kiểu OpenAPI (p0-09) chưa có. ⚠️ Khi BE đổi tên trường thì CHỈ sửa file này và
 * `reviews.service.ts` (`feature-structure.md`).
 *
 * ⛔ Điểm/nhận xét (`score10`, `rubricScores`, `feedback`) CHỈ có khi BE cho người xem thấy (`review-visibility`): người chấm
 * chưa nộp và MEMBER khác nhận review KHÔNG có ba trường này (và trạng thái người khác bị che thành `SUBMITTED`). Client không
 * tự suy quyền xem — chỉ vẽ cái BE trả.
 */
import type { ColumnKind, ReviewState } from './boards.types';

/** Quyết định của MỘT người chấm khi nộp. */
export type ReviewDecision = 'APPROVED' | 'REQUEST_CHANGES';

export type ReviewRoundStatus = 'APPROVED' | 'CANCELLED' | 'CHANGES_REQUESTED' | 'OPEN' | 'WAIVED';

/** `SUBMITTED` = đã nộp nhưng người xem chưa được xem quyết định (chỉ thấy "đã chấm"). */
export type TaskReviewStatus =
  | 'APPROVED'
  | 'CANCELLED'
  | 'PENDING'
  | 'REASSIGNED'
  | 'REQUEST_CHANGES'
  | 'SUBMITTED';

/** Lý do một lượt chấm cá nhân không còn hiệu lực. */
export type ReviewCancelReason =
  | 'BECAME_ASSIGNEE'
  | 'MANUAL'
  | 'MEMBER_LEFT'
  | 'REVIEW_DISABLED'
  | 'ROUND_CLOSED';

/** Lý do cả lượt chấm đóng. */
export type RoundCloseReason =
  | 'APPROVED'
  | 'CHANGES_REQUESTED'
  | 'LEFT_REVIEW'
  | 'REVIEW_DISABLED'
  | 'TASK_DELETED'
  | 'WAIVED';

export interface RubricCriterion {
  /** `r_` + 6 ký tự, ổn định khi đổi tên (BE cấp). */
  id: string;
  label: string;
  description?: string | null;
  maxScore: number;
}

export interface RubricScore {
  criterionId: string;
  score: number;
}

export interface ReviewerDto {
  id: string;
  name: string;
  avatarUrl: string | null;
}

export interface TaskReviewDto {
  id: string;
  roundId: string;
  reviewer: ReviewerDto;
  status: TaskReviewStatus;
  assignedAt: string;
  submittedAt: string | null;
  /** Dùng làm `expectedVersion` khi nộp/giao lại. */
  version: number;
  score10?: number | null;
  rubricScores?: RubricScore[];
  feedback?: string | null;
  cancelReason?: ReviewCancelReason | null;
}

export interface ReviewRoundDto {
  id: string;
  round: number;
  status: ReviewRoundStatus;
  requiredReviews: number;
  configuredReviews: number;
  assignedCount: number;
  approvedCount: number;
  /** Nhóm không đủ người chấm nên `requiredReviews` thực < cấu hình. */
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

export interface ReviewPermissions {
  reassign: boolean;
  submit: boolean;
  waive: boolean;
}

/** `GET /tasks/:id/reviews` = `TaskDetailDto.reviews`. */
export interface TaskReviewsDto {
  /** Bảng đang bật chấm chéo (ẩn khối khi tắt và thẻ chưa từng có lượt). */
  enabled: boolean;
  /** Số lượt duyệt cần theo cấu hình hiện tại (áp cho lượt MỚI). */
  requiredReviews: number;
  currentRound: ReviewRoundDto | null;
  /** Các lượt cũ hơn, mới → cũ. */
  history: ReviewRoundDto[];
  /** Review của CHÍNH người xem trong `currentRound`. */
  myReview: TaskReviewDto | null;
  myPermissions: ReviewPermissions;
}

export interface SubmitReviewPayload {
  status: ReviewDecision;
  rubricScores: RubricScore[];
  /** Chỉ khi lượt KHÔNG có rubric. */
  score10?: number;
  feedback?: string;
  /** `TaskReviewDto.version` lúc mở màn. */
  expectedVersion: number;
}

export interface SubmitReviewResult {
  review: TaskReviewDto;
  round: ReviewRoundDto;
  task: {
    id: string;
    reviewState: ReviewState;
    columnId: string;
    columnKind: ColumnKind;
    position: string;
    version: number;
  };
}

export interface ReassignReviewPayload {
  /** Vắng = hệ thống tự chọn theo cân tải. */
  toUserId?: string;
  reason: string;
}

export interface ReassignReviewResult {
  cancelled: TaskReviewDto;
  assigned: TaskReviewDto;
}

/** `GET/PUT /boards/:id/review-config`. */
export interface ReviewConfigDto {
  enabled: boolean;
  requiredReviews: number;
  rubric: RubricCriterion[];
  reviewerPool?: string[];
  autoCompleteOnApproval: boolean;
  /** Số người chấm được của nhóm — "Nhóm có N người chấm được". */
  eligibleReviewerCount: number;
  openRoundCount: number;
  /** `Board.version` — làm `expectedVersion` khi lưu. */
  version: number;
}

export interface RubricCriterionInput {
  /** Thiếu = tiêu chí mới (server cấp id). */
  id?: string;
  label: string;
  description?: string;
  maxScore: number;
}

export interface PutReviewConfigPayload {
  enabled: boolean;
  requiredReviews: number;
  rubric: RubricCriterionInput[];
  reviewerPool?: string[];
  autoCompleteOnApproval: boolean;
  expectedVersion: number;
}

export type MyReviewsStatus = 'PENDING' | 'SUBMITTED';

/** Một hàng của `GET /me/reviews` — "Cần chấm của tôi". */
export interface MyReviewItemDto {
  reviewId: string;
  status: 'APPROVED' | 'PENDING' | 'REQUEST_CHANGES';
  assignedAt: string;
  submittedAt: string | null;
  task: {
    id: string;
    title: string;
    boardId: string;
    boardName: string;
    workspaceId: string;
    workspaceName: string;
    columnKind: ColumnKind;
  };
  round: { round: number; approvedCount: number; requiredReviews: number };
}

/**
 * `409 TASK_002 { reason: 'REVIEW_REQUIRED', … }` khi kéo thẻ sang DONE mà chưa đủ lượt duyệt. `roundStatus` = trạng thái lượt
 * mới nhất của thẻ (`NONE` khi thẻ chưa từng vào REVIEW).
 */
export interface MoveBlockedDetails {
  reason: 'REVIEW_REQUIRED';
  approvedCount: number;
  requiredReviews: number;
  roundStatus: ReviewRoundStatus | 'NONE';
}

/** Một lần kéo thẻ sang DONE bị chặn — `useMoveTask` báo cho `BoardScopeProvider` để hiện `MoveBlockedSheet`. */
export interface MoveBlockedInfo {
  details: MoveBlockedDetails;
  taskId: string;
  taskTitle?: string;
}

/** Payload `task:review-updated` (room `board:{id}`) — KHÔNG có điểm/nhận xét. */
export interface ReviewUpdatedPayload {
  taskId: string;
  boardId: string;
  roundId: string;
  round: number;
  status: ReviewRoundStatus;
  approvedCount: number;
  requiredReviews: number;
  assignedCount: number;
  reviewerIds: string[];
}
