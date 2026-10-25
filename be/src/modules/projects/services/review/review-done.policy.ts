import { AppError } from "../../../../core/exceptions";
import { ErrorCode, ErrorMessages } from "../../../../core/utils/error.codes";
import type { TaskCompletionMeta, TaskMovePolicy, TaskMovePolicyContext } from "../task-move-policy";
import type { ReviewDeps } from "./review.deps";
import { parseBoardReview } from "./review-config.schema";

/**
 * Chặn thẻ VÀO cột DONE khi bảng bật chấm chéo mà chưa đủ duyệt (p4-05 README §2 "Chặn Done") — kể cả khi gọi API trực tiếp và kể cả khi
 * thẻ nhảy thẳng TODO → DONE. Client chỉ GỢI Ý, server quyết: `409 TASK_002 { reason: "REVIEW_REQUIRED", approvedCount, requiredReviews, roundStatus }`.
 *
 * Qua được khi `reviewState = APPROVED` VÀ lượt hiện tại `APPROVED`/`WAIVED` (tự duyệt do thiếu người ánh xạ `APPROVED`); metadata
 * `review { enabled, approved, roundId, autoApproved, waived }` được `TaskMoveService` gộp vào outbox `task.completed`.
 */
export class ReviewDonePolicy implements TaskMovePolicy {
  readonly name = "p4-05.review-done";

  constructor(private readonly d: Pick<ReviewDeps, "rounds">) {}

  async check(ctx: TaskMovePolicyContext): Promise<TaskCompletionMeta> {
    const config = parseBoardReview(ctx.board.review);
    if (!config.enabled) return { review: { enabled: false, approved: false } };

    const latest = await this.d.rounds.findLatest(ctx.task.id, ctx.tx);
    if (latest && ctx.task.reviewState === "APPROVED" && (latest.status === "APPROVED" || latest.status === "WAIVED")) {
      return { review: { enabled: true, approved: true, roundId: latest.id, autoApproved: latest.autoApproved, waived: latest.status === "WAIVED" } };
    }
    const open = latest?.status === "OPEN" ? latest : null;
    throw new AppError(ErrorMessages[ErrorCode.TASK_002], 409, ErrorCode.TASK_002, {
      reason: "REVIEW_REQUIRED",
      approvedCount: open?.approvedCount ?? 0,
      requiredReviews: open?.requiredReviews ?? config.requiredReviews,
      roundStatus: latest?.status ?? "NONE",
    });
  }
}
