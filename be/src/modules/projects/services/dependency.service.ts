import { AppError } from "../../../core/exceptions";
import type { AuthUser } from "../../../core/types/express";
import { ErrorCode, ErrorMessages } from "../../../core/utils/error.codes";
import type { Task, TaskActivity } from "../entities/task.interface";
import {
  DuplicateDependencyError,
  type ITaskDependencyRepository,
  type TaskDependency,
} from "../repositories/task-dependency.repository.interface";
import type { ITaskRepository } from "../repositories/task.repository.interface";
import type { TxContext } from "../repositories/unit-of-work";
import type { IBoardEmitter } from "../realtime/board-emitter";
import type { IProjectDirectory } from "../repositories/project-directory.interface";
import { boardEdgeLoader } from "./dependency-edge-loader";
import { DependencyGraphTooLargeError, findPath } from "./dependency-graph";
import { presentTaskDependencies, type TaskDependenciesDto } from "./dependency.presenter";
import { STATIC_DEPENDENCY_LIMITS, type IDependencyLimits } from "./dependency-limits";
import type { BoardWriteRunner } from "./board-write-runner";
import type { ProjectAccess } from "./project-access";
import type { TaskActivityWriter } from "./task-activity.writer";
import { TaskPublisher } from "./task-publisher";

export interface DependencyDto {
  id: string;
  predecessorId: string;
  successorId: string;
  type: "FINISH_TO_START";
  createdBy: string;
  createdAt: string;
}

export interface DependencyServiceDeps {
  access: ProjectAccess;
  tasks: ITaskRepository;
  dependencies: ITaskDependencyRepository;
  /** Ghi phụ thuộc chạy qua hàng đợi ghi của BẢNG (cùng cơ chế kéo/tạo thẻ): tuần tự trong tiến trình, khác instance → write-conflict trên `Board` + retry, quá số lần thử → 503. */
  runner: BoardWriteRunner;
  activity: TaskActivityWriter;
  emitter: IBoardEmitter;
  directory: IProjectDirectory;
  /** Giới hạn hiệu lực (mặc định `LIMITS`; container truyền bản đọc `SystemConfig`). */
  limits?: IDependencyLimits;
  clock?: () => Date;
}

const taskError = (code: "TASK_005" | "TASK_017" | "TASK_018" | "TASK_021", status: 400 | 409, details?: Record<string, unknown>): AppError =>
  new AppError(ErrorMessages[ErrorCode[code]], status, ErrorCode[code], details);

const toDependencyDto = (d: TaskDependency): DependencyDto => ({
  id: d.id,
  predecessorId: d.predecessorId,
  successorId: d.successorId,
  type: d.type,
  createdBy: d.createdBy,
  createdAt: d.createdAt.toISOString(),
});

interface WriteResult {
  edge: TaskDependency | null;
  changed: Task[];
  activities: TaskActivity[];
}

/**
 * Phụ thuộc FINISH_TO_START giữa hai thẻ CÙNG bảng (p4-04 be.md §5.1). Thêm/xoá chạy trong MỘT transaction: kiểm giới
 * hạn + kiểm vòng DAG (BFS theo lô) + ghi cạnh + ĐẾM LẠI bộ đếm hai thẻ (`version+1` ⇒ hai lệnh đồng thời chạm cùng
 * thẻ bị Mongo coi là xung đột ghi và chạy lại — lệnh sau thấy cạnh của lệnh trước khi kiểm vòng) + `TaskActivity`.
 * Emit `task:updated` (`changed: ["dependencies"]`) + `task:activity` SAU commit.
 */
export class DependencyService {
  private readonly publisher: TaskPublisher;

  constructor(private readonly d: DependencyServiceDeps) {
    this.publisher = new TaskPublisher(d.emitter, d.directory, d.clock);
  }

  async list(user: AuthUser, taskId: string): Promise<TaskDependenciesDto> {
    const { task } = await this.d.access.task(user, taskId, "workspace.board.read");
    return presentTaskDependencies(task.id, task.boardId, this.d, this.now());
  }

  /** `successorId` = `:id` (thẻ sau). Trả `created=false` khi cạnh đã có (idempotent → 200 bản cũ). */
  async add(user: AuthUser, successorId: string, predecessorId: string): Promise<{ dependency: DependencyDto; created: boolean }> {
    const { task: seen } = await this.d.access.task(user, successorId, "workspace.task.update");
    if (predecessorId === seen.id) throw taskError("TASK_017", 400);
    const existing = await this.d.dependencies.find(predecessorId, seen.id);
    if (existing) {
      // Idempotent CHỈ khi cả hai thẻ còn hợp lệ (be.md §5.1: bước kiểm thẻ trước bước "cạnh đã có") — thẻ trước đã xoá → TASK_017.
      const predecessor = await this.d.tasks.findById(predecessorId);
      if (!predecessor || predecessor.deletedAt || predecessor.boardId !== seen.boardId) throw taskError("TASK_017", 400);
      return { dependency: toDependencyDto(existing), created: false };
    }

    let result: WriteResult;
    try {
      result = await this.d.runner.run(seen.boardId, (tx) => this.addInTx(tx, user.id, seen.id, predecessorId));
    } catch (err) {
      if (!(err instanceof DuplicateDependencyError)) throw err;
      // Đua tạo cùng cạnh: transaction đã huỷ — đọc lại NGOÀI transaction, trả bản của lệnh thắng.
      const winner = await this.d.dependencies.find(predecessorId, seen.id);
      if (!winner) throw err;
      return { dependency: toDependencyDto(winner), created: false };
    }
    if (!result.edge) throw taskError("TASK_017", 400);
    const created = result.changed.length > 0;
    if (created) await this.publish(result, user.id);
    return { dependency: toDependencyDto(result.edge), created };
  }

  /** Không có cạnh → vẫn thành công (204). Thẻ sau không thấy/không có quyền → 404 trung tính. */
  async remove(user: AuthUser, successorId: string, predecessorId: string): Promise<void> {
    const { task } = await this.d.access.task(user, successorId, "workspace.task.update");
    const result = await this.d.runner.run(task.boardId, async (tx): Promise<WriteResult> => {
      const removed = await this.d.dependencies.delete(predecessorId, task.id, tx);
      if (removed === 0) return { edge: null, changed: [], activities: [] };
      return this.afterEdgeChange(tx, user.id, task.id, predecessorId, "DEPENDENCY_REMOVED", null);
    });
    if (result.changed.length > 0) await this.publish(result, user.id);
  }

  /**
   * Sink `task.events` (be.md §5.8): thẻ X hoàn thành/mở lại/xoá/khôi phục → ĐẾM LẠI X và mọi thẻ trước/sau của X; chỉ
   * ghi + `task:updated` (`changed: ["dependencies"]`) khi bộ đếm đổi ⇒ job chạy lặp vô hại.
   */
  async recountAround(taskId: string): Promise<void> {
    const { predecessors, successors } = await this.d.dependencies.listForTask(taskId);
    const ids = new Set([taskId, ...predecessors.map((e) => e.predecessorId), ...successors.map((e) => e.successorId)]);
    for (const id of ids) {
      const updated = await this.d.dependencies.recountIfChanged(id);
      if (updated) await this.publisher.updated(updated, null, ["dependencies"]);
    }
  }

  private async addInTx(tx: TxContext, actorId: string, successorId: string, predecessorId: string): Promise<WriteResult> {
    const again = await this.d.dependencies.find(predecessorId, successorId, tx);
    if (again) return { edge: again, changed: [], activities: [] };

    const successor = await this.d.tasks.findById(successorId, tx);
    const predecessor = await this.d.tasks.findById(predecessorId, tx);
    if (!successor || successor.deletedAt || !predecessor || predecessor.deletedAt || predecessor.boardId !== successor.boardId) {
      throw taskError("TASK_017", 400);
    }

    const limits = await (this.d.limits ?? STATIC_DEPENDENCY_LIMITS).load();
    const max = limits.dependenciesMax;
    if ((await this.d.dependencies.countPredecessors(successorId, tx)) >= max) throw taskError("TASK_018", 409);
    if ((await this.d.dependencies.countSuccessors(predecessorId, tx)) >= max) throw taskError("TASK_018", 409);

    // Thêm P → S tạo vòng ⇔ đã có đường S ⇝ P.
    let cycle: string[] | null;
    const loader = boardEdgeLoader(this.d.dependencies, successor.boardId, tx);
    try {
      cycle = await findPath(
        successorId,
        predecessorId,
        (ids, limit) => loader.outgoing(ids, limit),
        limits.dependencyGraphVisitMax
      );
    } catch (err) {
      if (err instanceof DependencyGraphTooLargeError) throw taskError("TASK_021", 409);
      throw err;
    }
    if (cycle) throw taskError("TASK_005", 409, { cycle });

    const edge = await this.d.dependencies.create(
      { workspaceId: successor.workspaceId, boardId: successor.boardId, predecessorId, successorId, createdBy: actorId },
      tx
    );
    const res = await this.afterEdgeChange(tx, actorId, successorId, predecessorId, "DEPENDENCY_ADDED", edge);
    if (res.changed.length < 2) throw taskError("TASK_017", 400); // một thẻ vừa bị xoá giữa chừng → huỷ cả transaction
    return res;
  }

  /** Đếm lại bộ đếm hai thẻ + ghi activity ở cả hai phía. */
  private async afterEdgeChange(
    tx: TxContext,
    actorId: string,
    successorId: string,
    predecessorId: string,
    type: "DEPENDENCY_ADDED" | "DEPENDENCY_REMOVED",
    edge: TaskDependency | null
  ): Promise<WriteResult> {
    const changed: Task[] = [];
    const activities: TaskActivity[] = [];
    // Luôn đếm lại theo THỨ TỰ id: hai lệnh ngược chiều (X→Y và Y→X) cùng chạm hai thẻ theo cùng thứ tự nên bên sau bị write-conflict
    // ngay ở thẻ đầu (chưa giữ khoá thẻ nào) thay vì mỗi bên giữ một thẻ rồi cùng huỷ nhau.
    const recounted = new Map<string, Task | null>();
    for (const id of [successorId, predecessorId].sort()) recounted.set(id, await this.d.dependencies.recount(id, tx));
    const successor = recounted.get(successorId) ?? null;
    const predecessor = recounted.get(predecessorId) ?? null;
    const sides: [Task | null, Record<string, unknown>][] = [
      [successor, { predecessorId }],
      [predecessor, { successorId }],
    ];
    for (const [task, payload] of sides) {
      if (!task) continue;
      changed.push(task);
      const added = type === "DEPENDENCY_ADDED";
      activities.push(
        await this.d.activity.record(tx, {
          taskId: task.id,
          boardId: task.boardId,
          workspaceId: task.workspaceId,
          actorId,
          type,
          before: added ? null : payload,
          after: added ? payload : null,
        })
      );
    }
    return { edge, changed, activities };
  }

  private async publish(result: WriteResult, actorId: string): Promise<void> {
    const boardId = result.changed[0]?.boardId;
    await Promise.all([
      ...result.changed.map((t) => this.publisher.updated(t, actorId, ["dependencies"])),
      boardId ? this.publisher.activities(boardId, result.activities) : Promise.resolve(),
    ]);
  }

  private now(): Date {
    return this.d.clock ? this.d.clock() : new Date();
  }
}
