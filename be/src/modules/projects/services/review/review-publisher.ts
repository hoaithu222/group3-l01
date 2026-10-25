import { logger } from "../../../../infrastructure/logger";
import type { Task, TaskActivity } from "../../entities/task.interface";
import { presentTaskCards } from "../task.presenter";
import { TaskPublisher } from "../task-publisher";
import type { ReviewDeps } from "./review.deps";
import { nowOf } from "./review.deps";

export interface PublishOptions {
  actorId?: string | null;
  /** Yêu cầu sửa đưa thẻ về IN_PROGRESS → `task:moved` (actorId null). */
  moved?: { before: Task; after: Task };
  /** Activity vừa ghi → `task:activity` (để nhật ký thẻ đang mở cập nhật ngay). */
  activities?: TaskActivity[];
}

/**
 * Phát realtime SAU commit (best-effort: lỗi chỉ log — client vẫn hồi phục nhờ refetch khi reconnect). Đọc trạng thái HIỆN TẠI từ DB
 * (không dùng dữ liệu cũ trong bộ nhớ) nên gọi lặp/đua nhau vẫn phát đúng; KHÔNG bao giờ mang điểm/nhận xét.
 *  · `task:review-updated` — tiến độ lượt (mở/đóng/huỷ, nộp, giao lại, miễn);
 *  · `task:updated { changed: ["review"] }` — thẻ mini mới (`reviewState` + `review` tiến độ);
 *  · `task:moved` (actorId null) khi Yêu cầu sửa đưa thẻ về IN_PROGRESS; `task:activity` cho các dòng nhật ký mới.
 */
export class ReviewPublisher {
  private readonly tasksPublisher: TaskPublisher;

  constructor(private readonly d: Pick<ReviewDeps, "rounds" | "reviews" | "tasks" | "directory" | "emitter" | "clock">) {
    this.tasksPublisher = new TaskPublisher(d.emitter, d.directory, d.clock);
  }

  async publish(taskId: string, opts: PublishOptions = {}): Promise<void> {
    try {
      const task = await this.d.tasks.findById(taskId);
      if (!task) return;
      const round = await this.d.rounds.findLatest(taskId);
      if (round) {
        const reviews = await this.d.reviews.listByRound(round.id);
        this.d.emitter.taskReviewUpdated(task.boardId, {
          taskId,
          boardId: task.boardId,
          roundId: round.id,
          round: round.round,
          status: round.status,
          approvedCount: round.approvedCount,
          requiredReviews: round.requiredReviews,
          assignedCount: round.assignedCount,
          reviewerIds: reviews.filter((r) => r.status === "PENDING" || r.status === "APPROVED" || r.status === "REQUEST_CHANGES").map((r) => r.reviewerId),
        });
      }
      const [card] = await presentTaskCards([task], this.d.directory, nowOf(this.d));
      const review = round && round.status === "OPEN" ? { approvedCount: round.approvedCount, requiredReviews: round.requiredReviews } : null;
      this.d.emitter.taskUpdated(task.boardId, { task: { ...card, review }, actorId: opts.actorId ?? null, changed: ["review"] });
      if (opts.moved) this.moved(opts.moved.before, opts.moved.after);
      if (opts.activities && opts.activities.length > 0) await this.tasksPublisher.activities(task.boardId, opts.activities);
    } catch (err) {
      logger.warn("[projects] phát realtime chấm chéo thất bại", { taskId, error: err instanceof Error ? err.message : String(err) });
    }
  }

  private moved(before: Task, after: Task): void {
    this.d.emitter.taskMoved(after.boardId, {
      id: after.id,
      boardId: after.boardId,
      fromColumnId: before.columnId,
      columnId: after.columnId,
      columnKind: after.columnKind,
      position: after.position,
      version: after.version,
      completedAt: after.completedAt ? after.completedAt.toISOString() : null,
      actorId: null,
      clientMutationId: null,
    });
  }
}
