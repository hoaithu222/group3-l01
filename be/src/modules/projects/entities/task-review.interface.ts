/**
 * Thực thể chấm chéo (p4-05). `Board.review` (JSON) là cấu hình SỐNG; mỗi lần thẻ vào cột REVIEW tạo một `TaskReviewRound` chụp
 * lại rubric (`rubricSnapshot`) nên đổi cấu hình không làm hỏng lượt đang mở. Điểm/nhận xét chỉ nằm ở `TaskReview`.
 */

export const ROUND_STATUSES = ["OPEN", "APPROVED", "CHANGES_REQUESTED", "CANCELLED", "WAIVED"] as const;
export type ReviewRoundStatusValue = (typeof ROUND_STATUSES)[number];

export const REVIEW_STATUSES = ["PENDING", "APPROVED", "REQUEST_CHANGES", "CANCELLED", "REASSIGNED"] as const;
export type TaskReviewStatusValue = (typeof REVIEW_STATUSES)[number];

/** Lý do một lượt chấm cá nhân không còn hiệu lực. */
export type ReviewCancelReason = "ROUND_CLOSED" | "BECAME_ASSIGNEE" | "MEMBER_LEFT" | "REVIEW_DISABLED" | "MANUAL";

/** Lý do lượt chấm đóng. */
export type RoundCloseReason = "APPROVED" | "CHANGES_REQUESTED" | "LEFT_REVIEW" | "REVIEW_DISABLED" | "TASK_DELETED" | "WAIVED";

export interface RubricCriterion {
  /** "r_" + 6 ký tự [A-Za-z0-9], ổn định khi sửa tên. */
  id: string;
  label: string;
  description: string | null;
  maxScore: number;
}

export interface RubricScore {
  criterionId: string;
  score: number;
}

/** Cấu hình chấm chéo của bảng (`Board.review`, đã chuẩn hoá qua `parseBoardReview`). */
export interface BoardReviewConfig {
  enabled: boolean;
  requiredReviews: number;
  rubric: RubricCriterion[];
  /** Luôn `true` — không cho tắt tự chấm (README §2). */
  preventSelfReview: true;
  /** P1: giới hạn người chấm trong nhóm này; vắng = mọi thành viên MEMBER+. */
  reviewerPool?: string[];
  /** P1: tự chuyển Done khi đủ duyệt (chưa áp dụng ở P0 — chỉ lưu). */
  autoCompleteOnApproval: boolean;
}

export interface TaskReviewRound {
  id: string;
  taskId: string;
  boardId: string;
  workspaceId: string;
  round: number;
  status: ReviewRoundStatusValue;
  /** `task:<taskId>` khi OPEN; `round:<id>` khi đã đóng. */
  activeKey: string;
  requiredReviews: number;
  configuredReviews: number;
  assignedCount: number;
  approvedCount: number;
  rubricSnapshot: RubricCriterion[];
  shortage: boolean;
  autoApproved: boolean;
  /** `null` = hệ thống (hiệu ứng move / backfill / đối soát). */
  openedBy: string | null;
  openedAt: Date;
  closedAt: Date | null;
  closeReason: RoundCloseReason | null;
  waivedBy: string | null;
  waiveReason: string | null;
  version: number;
}

export interface TaskReview {
  id: string;
  roundId: string;
  taskId: string;
  boardId: string;
  workspaceId: string;
  reviewerId: string;
  status: TaskReviewStatusValue;
  /** `null` = hệ thống (cân tải tự động). */
  assignedBy: string | null;
  assignedAt: Date;
  submittedAt: Date | null;
  score10: number | null;
  rubricScores: RubricScore[];
  feedback: string | null;
  cancelReason: ReviewCancelReason | null;
  replacedById: string | null;
  version: number;
}

export const openRoundKey = (taskId: string): string => `task:${taskId}`;
export const closedRoundKey = (roundId: string): string => `round:${roundId}`;
/** Khoá duy nhất theo trạng thái: lượt mở ⇒ theo thẻ (một lượt mở/thẻ), lượt đóng ⇒ theo chính lượt. */
export const roundActiveKey = (r: Pick<TaskReviewRound, "id" | "taskId" | "status">): string =>
  r.status === "OPEN" ? openRoundKey(r.taskId) : closedRoundKey(r.id);

export interface RoundCreateInput {
  id: string;
  taskId: string;
  boardId: string;
  workspaceId: string;
  round: number;
  /** `OPEN`, hoặc `APPROVED` khi tự duyệt vì không có ứng viên. */
  status: "OPEN" | "APPROVED";
  requiredReviews: number;
  configuredReviews: number;
  assignedCount: number;
  approvedCount: number;
  rubricSnapshot: RubricCriterion[];
  shortage: boolean;
  autoApproved: boolean;
  openedBy: string | null;
  openedAt: Date;
  closedAt: Date | null;
  closeReason: RoundCloseReason | null;
}

/** Trường đổi của lượt (CAS theo `version`, `version +1`). Đổi sang trạng thái ≠ OPEN ⇒ repository tự đặt `activeKey = round:<id>`. */
export interface RoundUpdate {
  status?: ReviewRoundStatusValue;
  requiredReviews?: number;
  assignedCount?: number;
  approvedCount?: number;
  shortage?: boolean;
  autoApproved?: boolean;
  closedAt?: Date | null;
  closeReason?: RoundCloseReason | null;
  waivedBy?: string | null;
  waiveReason?: string | null;
}

export interface ReviewCreateInput {
  roundId: string;
  taskId: string;
  boardId: string;
  workspaceId: string;
  reviewerId: string;
  assignedBy: string | null;
  assignedAt: Date;
}

/** Trường đổi của một lượt chấm (CAS `where { id, version, status: PENDING }`, `version +1`). */
export interface ReviewUpdate {
  status: TaskReviewStatusValue;
  submittedAt?: Date | null;
  score10?: number | null;
  rubricScores?: RubricScore[];
  feedback?: string | null;
  cancelReason?: ReviewCancelReason | null;
  replacedById?: string | null;
}

/** Tải hiện tại của một người chấm trong workspace — nguồn của bộ chọn cân tải. */
export interface ReviewerLoad {
  userId: string;
  /** Số `TaskReview PENDING` trong workspace. */
  pending: number;
  /** Lần được giao gần nhất (mọi trạng thái); `null` = chưa từng. */
  lastAssignedAt: Date | null;
}

/** Tiến độ lượt đang mở của một thẻ — chip "Chờ duyệt 1/2" trên thẻ mini. */
export interface ReviewProgress {
  approvedCount: number;
  requiredReviews: number;
}

/** Hàng của `GET /me/reviews` (chưa gắn thẻ/bảng/nhóm — service tra thêm). */
export interface MyReviewRow {
  review: TaskReview;
  round: TaskReviewRound;
}

export interface WorkspaceReviewStats {
  openRounds: number;
  pendingReviews: number;
  overdue72h: number;
  /** Trung vị giờ từ lúc được giao đến lúc nộp (các lượt nộp trong khoảng); `null` khi chưa có. */
  medianHoursToSubmit: number | null;
  roundsInPeriod: number;
  autoApprovedRounds: number;
  waivedRounds: number;
  openRoundsByBoard: Map<string, number>;
}
