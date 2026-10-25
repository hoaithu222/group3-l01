import type { IEventOutbox } from "../events/event-outbox";
import type { IBoardEmitter } from "../realtime/board-emitter";
import type { IBoardRepository } from "../repositories/board.repository.interface";
import type { ILabelRepository } from "../repositories/label.repository.interface";
import type { IProjectDirectory } from "../repositories/project-directory.interface";
import type { ITaskRepository } from "../repositories/task.repository.interface";
import type { ITaskReviewRoundRepository } from "../repositories/task-review.repository.interface";
import type { BoardWriteRunner } from "./board-write-runner";
import type { ProjectAccess } from "./project-access";
import type { IProjectConfig } from "./project-config";
import type { IRebalanceScheduler } from "./rebalance-scheduler";
import type { TaskActivityWriter } from "./task-activity.writer";
import type { TaskMoveRegistry } from "./task-move-policy";

/** Phụ thuộc chung của các service thẻ (`TaskService`, `TaskMoveService`; p3-03 thêm patch/xoá dùng cùng bộ). */
export interface TaskServiceDeps {
  boards: IBoardRepository;
  tasks: ITaskRepository;
  labels: ILabelRepository;
  directory: IProjectDirectory;
  access: ProjectAccess;
  runner: BoardWriteRunner;
  config: IProjectConfig;
  activity: TaskActivityWriter;
  outbox: IEventOutbox;
  emitter: IBoardEmitter;
  rebalance: IRebalanceScheduler;
  moveRegistry: TaskMoveRegistry;
  /** (p4-05) Tiến độ lượt chấm cho chip "Chờ duyệt 1/2" trên thẻ mini (`GET /boards/:id/tasks`); vắng → thẻ không có trường `review`. */
  reviewProgress?: Pick<ITaskReviewRoundRepository, "progressOf">;
}
