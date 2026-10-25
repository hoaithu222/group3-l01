import type { IEventOutbox } from "../../events/event-outbox";
import type { IBoardEmitter } from "../../realtime/board-emitter";
import type { IBoardRepository } from "../../repositories/board.repository.interface";
import type { IProjectDirectory } from "../../repositories/project-directory.interface";
import type { ITaskRepository } from "../../repositories/task.repository.interface";
import type { ITaskReviewRepository, ITaskReviewRoundRepository } from "../../repositories/task-review.repository.interface";
import type { BoardWriteRunner } from "../board-write-runner";
import type { ProjectAccess } from "../project-access";
import type { IRebalanceScheduler } from "../rebalance-scheduler";
import type { IAuditPort } from "../task-detail.deps";
import type { TaskActivityWriter } from "../task-activity.writer";
import type { IReviewDefaults } from "./review-defaults";

/** Phụ thuộc chung của các service chấm chéo (p4-05) — cùng kiểu `TaskServiceDeps` của p3-02. */
export interface ReviewDeps {
  rounds: ITaskReviewRoundRepository;
  reviews: ITaskReviewRepository;
  tasks: ITaskRepository;
  boards: IBoardRepository;
  directory: IProjectDirectory;
  access: ProjectAccess;
  /** Mọi ghi đổi thứ tự/số lượng thẻ (Yêu cầu sửa đưa thẻ về IN_PROGRESS) và mọi thao tác trên lượt chạy qua đây. */
  runner: BoardWriteRunner;
  activity: TaskActivityWriter;
  outbox: IEventOutbox;
  audit: IAuditPort;
  emitter: IBoardEmitter;
  rebalance: IRebalanceScheduler;
  defaults: IReviewDefaults;
  /** Đồng hồ (test cửa sổ ân hạn mở lại thẻ / mốc nhắc). */
  clock?: () => Date;
}

export const nowOf = (d: Pick<ReviewDeps, "clock">): Date => (d.clock ? d.clock() : new Date());
