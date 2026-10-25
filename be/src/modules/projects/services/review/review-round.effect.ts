import { LIMITS } from "../../../../core/constants/limits";
import type { ColumnKindValue } from "../../entities/board.interface";
import type { TaskMoveEffect, TaskMoveEffectContext } from "../task-move-policy";
import { parseBoardReview } from "./review-config.schema";
import type { ReviewDeps } from "./review.deps";
import type { ReviewRoundService } from "./review-round.service";

/**
 * Hiệu ứng CHẠY TRONG transaction `move` khi thẻ đổi LOẠI cột (p4-05 be.md §5.1). Ném lỗi ⇒ cả `move` rollback, nên không bao giờ có thẻ ở
 * REVIEW mà thiếu lượt chấm:
 *  · VÀO REVIEW (bảng bật chấm chéo): mở lượt + giao người chấm cân tải;
 *  · RỜI REVIEW sang cột KHÁC DONE: huỷ lượt đang mở (báo người chấm), `reviewState = NONE`; thẻ đã được duyệt mà bị kéo ra khỏi REVIEW
 *    (về IN_PROGRESS/TODO) cũng mất duyệt — làm tiếp tức là nội dung sẽ đổi;
 *  · RỜI DONE (mở lại thẻ): trong `reopenGraceMinutes` giữ kết quả duyệt (kéo nhầm), quá hạn thì `reviewState = NONE` (vào DONE lần sau cần lượt mới).
 * Sang DONE từ REVIEW không đụng gì ở đây: chính sách (`ReviewDonePolicy`) đã kiểm lượt APPROVED/WAIVED.
 */
export class ReviewRoundEffect implements TaskMoveEffect {
  readonly name = "p4-05.review-round";

  constructor(
    private readonly d: Pick<ReviewDeps, "tasks">,
    private readonly rounds: ReviewRoundService
  ) {}

  async onEnterKind(kind: ColumnKindValue, ctx: TaskMoveEffectContext): Promise<void> {
    if (kind !== "REVIEW") return;
    const config = parseBoardReview(ctx.board.review);
    if (!config.enabled) return;
    await this.rounds.openRound(ctx.tx, { task: ctx.after, board: ctx.board, config, openedBy: null, now: ctx.now });
  }

  async onLeaveKind(kind: ColumnKindValue, ctx: TaskMoveEffectContext): Promise<void> {
    if (kind === "REVIEW") return this.leaveReview(ctx);
    if (kind === "DONE") return this.reopen(ctx);
  }

  private async leaveReview(ctx: TaskMoveEffectContext): Promise<void> {
    if (ctx.toColumn.kind === "DONE") return;
    const cancelled = await this.rounds.cancelOpenRound(ctx.tx, ctx.after, "LEFT_REVIEW", ctx.now);
    if (!cancelled && ctx.before.reviewState === "APPROVED") await this.d.tasks.setReviewState(ctx.after.id, "NONE", ctx.tx);
  }

  private async reopen(ctx: TaskMoveEffectContext): Promise<void> {
    const completedAt = ctx.before.completedAt;
    if (!completedAt || ctx.before.reviewState === "NONE") return;
    const graceMs = LIMITS.review.reopenGraceMinutes * 60_000;
    if (ctx.now.getTime() - completedAt.getTime() > graceMs) await this.d.tasks.setReviewState(ctx.after.id, "NONE", ctx.tx);
  }
}
