import { logger } from "../../../../infrastructure/logger";
import { parseBoardReview } from "./review-config.schema";
import type { ReviewBackfillJob } from "./review-config.service";
import type { ReviewPublisher } from "./review-publisher";
import type { ReviewRoundService } from "./review-round.service";
import { nowOf, type ReviewDeps } from "./review.deps";

const BATCH = 100;

/**
 * Job `reports/review.backfill` (p4-05 be.md §5.5): bật chấm chéo ⇒ mở lượt cho thẻ ĐANG ở cột REVIEW (lô 100, bỏ qua thẻ đã có lượt mở); tắt ⇒ huỷ
 * mọi lượt đang mở (`REVIEW_DISABLED`, `reviewState = NONE`). Mỗi thẻ/lượt là MỘT transaction riêng qua `BoardWriteRunner` (tuần tự với `move`),
 * đọc lại cấu hình TRONG transaction nên bật rồi tắt liên tiếp không để lại lượt mồ côi. Idempotent — chạy lại vô hại.
 * `SYNC` (đổi `kind` cột có thẻ sang/khỏi REVIEW qua `PUT /boards/:id/columns`): mở lượt cho thẻ đang ở cột REVIEW (nếu bảng bật chấm chéo), đóng lượt (`LEFT_REVIEW`) của thẻ
 * không còn ở REVIEW và bỏ trạng thái "đã duyệt" của thẻ nằm ở TODO/IN_PROGRESS — cùng kết quả như kéo từng thẻ (`ReviewRoundEffect`).
 */
export class ReviewBackfillService {
  constructor(
    private readonly d: ReviewDeps,
    private readonly rounds: ReviewRoundService,
    private readonly publisher: ReviewPublisher
  ) {}

  async run(job: ReviewBackfillJob): Promise<{ opened: number; cancelled: number }> {
    const board = await this.d.boards.findById(job.boardId);
    if (!board) return { opened: 0, cancelled: 0 };
    const enabled = parseBoardReview(board.review).enabled;
    if (job.mode === "ENABLE" && enabled) return { opened: await this.enable(job.boardId), cancelled: 0 };
    if (job.mode === "DISABLE" && !enabled) return { opened: 0, cancelled: await this.disable(job.boardId) };
    if (job.mode === "SYNC") {
      const cancelled = (await this.closeLeftReview(job.boardId)) + (await this.clearStaleApproval(job.boardId));
      return { opened: enabled ? await this.enable(job.boardId) : 0, cancelled };
    }
    return { opened: 0, cancelled: 0 };
  }

  /** Lượt còn mở của thẻ không còn ở cột REVIEW (hoặc đã xoá) ⇒ `CANCELLED`; thẻ vẫn ở REVIEW giữ nguyên. */
  private async closeLeftReview(boardId: string): Promise<number> {
    let cancelled = 0;
    let after: string | null = null;
    for (;;) {
      const open = await this.d.rounds.listOpenByBoard(boardId, after, BATCH);
      for (const seen of open) {
        const outcome = await this.d.runner.run(boardId, async (tx) => {
          const task = await this.d.tasks.findById(seen.taskId, tx);
          if (task && !task.deletedAt && task.columnKind === "REVIEW") return null;
          const reason = !task || task.deletedAt ? "TASK_DELETED" : "LEFT_REVIEW";
          return (await this.rounds.cancelOpenRound(tx, { id: seen.taskId }, reason, nowOf(this.d))) ? reason : null;
        });
        if (outcome) {
          cancelled += 1;
          if (outcome !== "TASK_DELETED") await this.publisher.publish(seen.taskId);
        }
      }
      if (open.length < BATCH) break;
      after = open[open.length - 1].id;
    }
    if (cancelled > 0) logger.info("[review.backfill] đã đóng lượt chấm của thẻ rời cột REVIEW", { boardId, cancelled });
    return cancelled;
  }

  /** Thẻ ở TODO/IN_PROGRESS mà vẫn `reviewState = APPROVED` (cột vừa đổi khỏi REVIEW) ⇒ `NONE`: làm tiếp nghĩa là nội dung sẽ đổi, vào DONE sau cần lượt mới. */
  private async clearStaleApproval(boardId: string): Promise<number> {
    let cleared = 0;
    for (const kind of ["TODO", "IN_PROGRESS"] as const) {
      let after: string | null = null;
      for (;;) {
        const tasks = await this.d.tasks.listLiveByKind(boardId, kind, after, BATCH);
        for (const seen of tasks) {
          if (seen.reviewState !== "APPROVED") continue;
          const done = await this.d.runner.run(boardId, async (tx) => {
            const task = await this.d.tasks.findById(seen.id, tx);
            if (!task || task.deletedAt || task.reviewState !== "APPROVED" || (task.columnKind !== "TODO" && task.columnKind !== "IN_PROGRESS")) return false;
            return this.d.tasks.setReviewState(task.id, "NONE", tx);
          });
          if (done) {
            cleared += 1;
            await this.publisher.publish(seen.id);
          }
        }
        if (tasks.length < BATCH) break;
        after = tasks[tasks.length - 1].id;
      }
    }
    return cleared;
  }

  private async enable(boardId: string): Promise<number> {
    let opened = 0;
    let after: string | null = null;
    for (;;) {
      const tasks = await this.d.tasks.listLiveByKind(boardId, "REVIEW", after, BATCH);
      for (const seen of tasks) {
        const created = await this.d.runner.run(boardId, async (tx) => {
          const [board, task] = await Promise.all([this.d.boards.findById(boardId, tx), this.d.tasks.findById(seen.id, tx)]);
          if (!board || !task || task.deletedAt || task.columnKind !== "REVIEW") return false;
          const config = parseBoardReview(board.review);
          if (!config.enabled) return false;
          return (await this.rounds.openRound(tx, { task, board, config, openedBy: null, now: nowOf(this.d) })).created;
        });
        if (created) {
          opened += 1;
          await this.publisher.publish(seen.id);
        }
      }
      if (tasks.length < BATCH) break;
      after = tasks[tasks.length - 1].id;
    }
    logger.info("[review.backfill] đã mở lượt cho thẻ đang ở REVIEW", { boardId, opened });
    return opened;
  }

  private async disable(boardId: string): Promise<number> {
    let cancelled = 0;
    let after: string | null = null;
    for (;;) {
      const open = await this.d.rounds.listOpenByBoard(boardId, after, BATCH);
      for (const seen of open) {
        const done = await this.d.runner.run(boardId, async (tx) => {
          const board = await this.d.boards.findById(boardId, tx);
          if (!board || parseBoardReview(board.review).enabled) return false; // bật lại giữa chừng — giữ lượt
          return (await this.rounds.cancelOpenRound(tx, { id: seen.taskId }, "REVIEW_DISABLED", nowOf(this.d))) !== null;
        });
        if (done) {
          cancelled += 1;
          await this.publisher.publish(seen.taskId);
        }
      }
      if (open.length < BATCH) break;
      after = open[open.length - 1].id;
    }
    logger.info("[review.backfill] đã huỷ lượt chấm vì tắt chấm chéo", { boardId, cancelled });
    return cancelled;
  }
}
