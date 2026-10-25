import { LIMITS } from "../../../../core/constants/limits";
import { newObjectId } from "../../../../core/utils/object-id";
import type { TaskReview, TaskReviewRound } from "../../entities/task-review.interface";
import type { Task } from "../../entities/task.interface";
import { parseBoardReview } from "./review-config.schema";
import type { ReplaceCause, ReviewReassignService } from "./review-reassign.service";
import type { ReviewPublisher } from "./review-publisher";
import type { ReviewRoundService } from "./review-round.service";
import { nowOf, type ReviewDeps } from "./review.deps";

export interface ReconcileResult {
  replaced: number;
  cancelledRounds: number;
}

/**
 * Giữ chấm chéo NHẤT QUÁN với thế giới bên ngoài (p4-05 be.md §5.4). Ba nguồn kích hoạt, cùng một logic thay/huỷ:
 *  · `reassignForUsers` — sau `revokeScope` (rời/bị loại/bị chặn/hết hạn khách/đổi vai trò): review PENDING của người không còn đủ điều kiện → giao lại;
 *  · `onTaskAssigned` / `onTaskDeleted` / `onTaskEntered` — sink của `task.events` (người chấm thành người làm; thẻ xoá; thẻ tạo/khôi phục thẳng vào REVIEW);
 *  · `sweep` — cron TĨNH quét bù (mất sự kiện, `UserAnonymizer` không có điểm nối, đổi loại cột…): tối đa `reconcileScanMax` mục mỗi lượt, bắt đầu ở
 *    điểm NGẪU NHIÊN rồi vòng lại nên mọi mục đều được kiểm dần dù bảng lớn.
 * Mọi thay đổi chạy trong `BoardWriteRunner` (tuần tự với `move`/nộp chấm) và idempotent theo thực thể nguồn.
 */
export class ReviewReconcileService {
  constructor(
    private readonly d: ReviewDeps,
    private readonly rounds: ReviewRoundService,
    private readonly reassign: ReviewReassignService,
    private readonly publisher: ReviewPublisher
  ) {}

  async reassignForUsers(workspaceId: string, userIds: string[]): Promise<number> {
    const reviews = await this.d.reviews.listPendingOf(userIds, workspaceId, LIMITS.review.reconcileScanMax);
    return this.replaceIneligible(reviews);
  }

  async onTaskAssigned(taskId: string): Promise<number> {
    const [round, task] = await Promise.all([this.d.rounds.findOpen(taskId), this.d.tasks.findById(taskId)]);
    if (!round || !task || task.deletedAt) return 0;
    const pending = (await this.d.reviews.listByRound(round.id)).filter((r) => r.status === "PENDING" && task.assigneeIds.includes(r.reviewerId));
    let replaced = 0;
    for (const review of pending) replaced += await this.replaceOne(review, "BECAME_ASSIGNEE");
    return replaced;
  }

  async onTaskDeleted(taskId: string, boardId: string): Promise<boolean> {
    return this.cancelRound(boardId, taskId, "TASK_DELETED", false);
  }

  /** Thẻ vừa tạo/khôi phục: đang ở cột REVIEW của bảng bật chấm chéo mà chưa có lượt mở → mở lượt. */
  async onTaskEntered(taskId: string): Promise<boolean> {
    const seen = await this.d.tasks.findById(taskId);
    if (!seen || seen.deletedAt || seen.columnKind !== "REVIEW") return false;
    const created = await this.d.runner.run(seen.boardId, async (tx) => {
      const [board, task] = await Promise.all([this.d.boards.findById(seen.boardId, tx), this.d.tasks.findById(taskId, tx)]);
      if (!board || !task || task.deletedAt || task.columnKind !== "REVIEW") return false;
      const config = parseBoardReview(board.review);
      if (!config.enabled) return false;
      return (await this.rounds.openRound(tx, { task, board, config, openedBy: null, now: nowOf(this.d) })).created;
    });
    if (created) await this.publisher.publish(taskId);
    return created;
  }

  async sweep(): Promise<ReconcileResult> {
    const cap = LIMITS.review.reconcileScanMax;
    const start = newObjectId();
    const reviews = await this.window((after, n) => this.d.reviews.listPendingPage(after, n), start, cap);
    const rounds = await this.window((after, n) => this.d.rounds.listOpenPage(after, n), start, cap);
    const replaced = await this.replaceIneligible(reviews);
    let cancelledRounds = 0;
    for (const round of rounds) if (await this.cancelIfStale(round)) cancelledRounds += 1;
    return { replaced, cancelledRounds };
  }

  /** Trang bắt đầu sau `start`, nếu chưa đủ `cap` thì vòng lại từ đầu tới `start` — phủ đều theo thời gian. */
  private async window<T extends { id: string }>(page: (after: string | null, n: number) => Promise<T[]>, start: string, cap: number): Promise<T[]> {
    const first = await page(start, cap);
    if (first.length >= cap) return first;
    const wrapped = (await page(null, cap - first.length)).filter((r) => r.id <= start);
    return [...first, ...wrapped];
  }

  private async replaceIneligible(reviews: TaskReview[]): Promise<number> {
    let replaced = 0;
    const byWorkspace = new Map<string, TaskReview[]>();
    for (const r of reviews) byWorkspace.set(r.workspaceId, [...(byWorkspace.get(r.workspaceId) ?? []), r]);
    for (const [workspaceId, group] of byWorkspace) {
      const [active, tasks] = await Promise.all([
        this.d.directory.activeReviewerIds(workspaceId, [...new Set(group.map((r) => r.reviewerId))]),
        this.d.tasks.findLiveByIds([...new Set(group.map((r) => r.taskId))]),
      ]);
      const taskById = new Map<string, Task>(tasks.map((t) => [t.id, t]));
      for (const review of group) {
        const task = taskById.get(review.taskId);
        if (!task) continue; // thẻ đã xoá — lượt được đóng ở `cancelIfStale`
        const cause: ReplaceCause | null = !active.has(review.reviewerId) ? "MEMBER_LEFT" : task.assigneeIds.includes(review.reviewerId) ? "BECAME_ASSIGNEE" : null;
        if (cause) replaced += await this.replaceOne(review, cause);
      }
    }
    return replaced;
  }

  private async replaceOne(review: TaskReview, cause: ReplaceCause): Promise<number> {
    const out = await this.d.runner.run(review.boardId, (tx) => this.reassign.replaceReviewer(tx, review.id, cause));
    if (!out) return 0;
    await this.publisher.publish(out.taskId, { activities: out.activities, moved: out.moved });
    return 1;
  }

  /** Lượt mở mà thẻ đã xoá / không còn ở cột REVIEW / bảng đã tắt chấm chéo ⇒ đóng `CANCELLED`. */
  private async cancelIfStale(round: TaskReviewRound): Promise<boolean> {
    const [task, board] = await Promise.all([this.d.tasks.findById(round.taskId), this.d.boards.findById(round.boardId)]);
    const reason = !task || task.deletedAt ? "TASK_DELETED" : task.columnKind !== "REVIEW" ? "LEFT_REVIEW" : board && !parseBoardReview(board.review).enabled ? "REVIEW_DISABLED" : null;
    return reason ? this.cancelRound(round.boardId, round.taskId, reason, true) : false;
  }

  private async cancelRound(boardId: string, taskId: string, reason: "LEFT_REVIEW" | "REVIEW_DISABLED" | "TASK_DELETED", publish: boolean): Promise<boolean> {
    const done = await this.d.runner.run(boardId, async (tx) => (await this.rounds.cancelOpenRound(tx, { id: taskId }, reason, nowOf(this.d))) !== null);
    if (done && publish && reason !== "TASK_DELETED") await this.publisher.publish(taskId);
    return done;
  }
}
