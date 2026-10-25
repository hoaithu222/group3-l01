import { logger } from "../../../infrastructure/logger";
import type { IContributionFactRepository } from "../repositories/contribution-fact.repository.interface";
import type { IContributionSourceRepository } from "../repositories/contribution-source.repository.interface";
import type { ContributionFactsService } from "./contribution-facts.service";

const LOOKBACK_HOURS = 48;
const BOARD_PAGE = 200;
const REVIEW_PAGE = 500;

export interface ReconcileResult {
  boards: number;
  fixedBoards: number;
  reviewsSeen: number;
}

export interface ContributionReconcileDeps {
  facts: IContributionFactRepository;
  source: IContributionSourceRepository;
  factsService: ContributionFactsService;
  now?: () => Date;
}

/**
 * Cron 02:15 `contribution.reconcile` (be.md §5.4): dựng lại fact từ NGUỒN (`Task`/`TaskReview`) cho bảng có thay đổi trong 48 giờ — lưới an toàn khi sự kiện
 * outbox mất/tới lệch/consumer lỗi. Chỉ sửa cho khớp nguồn, không bao giờ xoá lịch sử:
 *  - thẻ đang ở cột DONE mà chưa có fact (hoặc fact của lần hoàn thành cũ hơn) → tạo/nâng fact (người làm HIỆN TẠI — sai lệch được ghi log);
 *  - fact còn `active` mà thẻ đã rời DONE (mất `task.reopened`) → vô hiệu; thẻ đã xoá hẳn khỏi DB thì GIỮ fact;
 *  - lượt chấm đã nộp mà chưa có fact → thêm.
 * Có sửa → tăng `factsVersion` + xếp tính lại. Idempotent: chạy lại không đổi gì.
 */
export class ContributionReconcileService {
  private readonly now: () => Date;

  constructor(private readonly d: ContributionReconcileDeps) {
    this.now = d.now ?? (() => new Date());
  }

  async run(): Promise<ReconcileResult> {
    const since = new Date(this.now().getTime() - LOOKBACK_HOURS * 3_600_000);
    const result: ReconcileResult = { boards: 0, fixedBoards: 0, reviewsSeen: 0 };

    let after: string | null = null;
    for (;;) {
      const page = await this.d.source.listBoardsTouchedSince(since, BOARD_PAGE, after);
      for (const board of page) {
        result.boards += 1;
        try {
          if ((await this.reconcileBoard(board.id, board.workspaceId)) > 0) result.fixedBoards += 1;
        } catch (err) {
          logger.warn("[contribution.reconcile] lỗi ở một bảng, bỏ qua", { boardId: board.id, error: err instanceof Error ? err.message : String(err) });
        }
      }
      if (page.length < BOARD_PAGE) break;
      after = page[page.length - 1].id;
    }

    let afterReview: string | null = null;
    for (;;) {
      const reviews = await this.d.source.listSubmittedReviewsSince(since, REVIEW_PAGE, afterReview);
      for (const r of reviews) {
        result.reviewsSeen += 1;
        await this.d.factsService.onReviewSubmitted({
          reviewId: r.id,
          taskId: r.taskId,
          boardId: r.boardId,
          workspaceId: r.workspaceId,
          reviewerId: r.reviewerId,
          status: r.status,
          score10: r.score10,
          submittedAt: r.submittedAt.toISOString(),
        });
      }
      if (reviews.length < REVIEW_PAGE) break;
      afterReview = reviews[reviews.length - 1].id;
    }
    return result;
  }

  /** Trả số thay đổi đã áp cho bảng. */
  async reconcileBoard(boardId: string, workspaceId: string): Promise<number> {
    const done = await this.d.source.listDoneTasks(boardId);
    const known = new Map((await this.d.facts.findTaskFacts(done.map((t) => t.id))).map((f) => [f.taskId, f]));
    let changes = 0;

    for (const task of done) {
      const fact = known.get(task.id);
      if (fact && fact.completionCount >= Math.max(1, task.completionCount)) continue;
      const outcome = await this.d.facts.applyCompleted({
        taskId: task.id,
        boardId: task.boardId,
        workspaceId: task.workspaceId,
        assigneeIds: task.assigneeIds,
        storyPoints: task.storyPoints,
        dueDate: task.dueDate,
        completedAt: task.completedAt,
        completionCount: Math.max(1, task.completionCount),
        reviewApproved: null,
      });
      if (outcome !== "SKIPPED") {
        changes += 1;
        logger.info("[contribution.reconcile] dựng lại fact từ nguồn", { boardId, taskId: task.id, had: fact ? "OLDER" : "MISSING" });
      }
    }

    const doneIds = new Set(done.map((t) => t.id));
    const active = (await this.d.facts.listActiveTaskFacts(boardId)).filter((f) => !doneIds.has(f.taskId));
    if (active.length > 0) {
      const states = await this.d.source.taskStates(active.map((f) => f.taskId));
      const reopened = active.filter((f) => {
        const state = states.get(f.taskId);
        return state !== undefined && state.columnKind !== "DONE";
      });
      if (reopened.length > 0) {
        changes += await this.d.facts.deactivate(reopened.map((f) => f.taskId));
        logger.info("[contribution.reconcile] vô hiệu fact của thẻ đã rời cột Hoàn thành", { boardId, count: reopened.length });
      }
    }

    if (changes > 0) await this.d.factsService.touch(boardId, workspaceId);
    return changes;
  }
}
