import { logger } from "../../../infrastructure/logger";
import type { Task, TaskActivity } from "../entities/task.interface";
import type { IBoardEmitter } from "../realtime/board-emitter";
import type { IProjectDirectory } from "../repositories/project-directory.interface";
import { presentActivities, type TaskCommentDto } from "./task-feed.presenter";
import { presentTaskCards, type TaskCardDto } from "./task.presenter";

/**
 * Phát realtime SAU khi commit (best-effort: lỗi dựng/emit chỉ log — client vẫn hồi phục nhờ refetch khi reconnect,
 * và một request đã ghi thành công không được trả lỗi vì socket). Dùng chung PATCH/checklist/đính kèm/bình luận.
 */
export class TaskPublisher {
  constructor(
    private readonly emitter: IBoardEmitter,
    private readonly directory: IProjectDirectory,
    private readonly clock: () => Date = () => new Date()
  ) {}

  /** `task:updated` với thẻ mini mới + tên trường vừa đổi (`changed`). Trả thẻ mini (dùng cho response nếu cần). */
  async updated(task: Task, actorId: string | null, changed: string[], clientMutationId?: string | null): Promise<TaskCardDto> {
    const [card] = await presentTaskCards([task], this.directory, this.clock());
    this.safely(task.boardId, () => this.emitter.taskUpdated(task.boardId, { task: card, actorId, changed, clientMutationId: clientMutationId ?? null }));
    return card;
  }

  async activities(boardId: string, items: TaskActivity[]): Promise<void> {
    if (items.length === 0) return;
    try {
      const dtos = await presentActivities(items, this.directory);
      for (const activity of dtos) this.safely(boardId, () => this.emitter.taskActivity(boardId, { taskId: activity.taskId, activity }));
    } catch (err) {
      logger.warn("[projects] dựng activity realtime thất bại", { boardId, error: err instanceof Error ? err.message : String(err) });
    }
  }

  comment(boardId: string, taskId: string, comment: TaskCommentDto): void {
    this.safely(boardId, () => this.emitter.taskActivity(boardId, { taskId, activity: { type: "COMMENT", comment } }));
  }

  private safely(boardId: string, fn: () => void): void {
    try {
      fn();
    } catch (err) {
      logger.warn("[projects] emit realtime thất bại", { boardId, error: err instanceof Error ? err.message : String(err) });
    }
  }
}
