import type { TaskReview, TaskReviewRound, TaskReviewStatusValue } from "../../entities/task-review.interface";

/**
 * Ai thấy điểm/nhận xét (p4-05 be.md §5.6, README §6) — THUẦN. Quy tắc theo LƯỢT (không theo từng review):
 *  · OWNER/ADMIN và NGƯỜI LÀM thẻ luôn thấy;
 *  · NGƯỜI CHẤM của lượt chỉ thấy sau khi tự nộp hoặc lượt đã đóng (không chấm theo đám đông);
 *  · người khác (MEMBER) chỉ thấy trạng thái tổng "1/2 duyệt" + tên người chấm — không điểm, không nhận xét.
 * Người chưa được thấy cũng KHÔNG thấy quyết định (Duyệt/Yêu cầu sửa) của review người khác: `status` bị che thành `SUBMITTED`.
 */

export interface ReviewViewer {
  userId: string;
  /** Vai trò OWNER/ADMIN của workspace (`workspace.board.edit`). */
  isAdmin: boolean;
  /** Người làm thẻ (`Task.assigneeIds`). */
  isAssignee: boolean;
}

export type MaskedReviewStatus = TaskReviewStatusValue | "SUBMITTED";

export const isSubmitted = (status: TaskReviewStatusValue): boolean => status === "APPROVED" || status === "REQUEST_CHANGES";

type ReviewLike = Pick<TaskReview, "reviewerId" | "status">;

/** Viewer có được xem điểm + nhận xét của MỌI review trong lượt này không. */
export function canSeeResults(viewer: ReviewViewer, round: Pick<TaskReviewRound, "status">, reviews: readonly ReviewLike[]): boolean {
  if (viewer.isAdmin || viewer.isAssignee) return true;
  const mine = reviews.find((r) => r.reviewerId === viewer.userId);
  if (!mine) return false;
  return isSubmitted(mine.status) || round.status !== "OPEN";
}

export interface VisibleReview {
  /** Trạng thái hiển thị: review của CHÍNH viewer luôn thật; của người khác bị che khi viewer chưa được xem kết quả. */
  status: MaskedReviewStatus;
  /** Có kèm `score10` / `rubricScores` / `feedback` không. */
  showResult: boolean;
}

export function visibilityOf(viewer: ReviewViewer, canSee: boolean, review: ReviewLike): VisibleReview {
  const own = review.reviewerId === viewer.userId;
  if (canSee || own) return { status: review.status, showResult: isSubmitted(review.status) };
  return { status: isSubmitted(review.status) ? "SUBMITTED" : review.status, showResult: false };
}
