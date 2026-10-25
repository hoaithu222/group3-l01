import { AppError, ScopeForbiddenError, ScopeNotFoundError, VersionConflictError } from "../../../core/exceptions";
import type { ResolvedAccess } from "../../../core/permission";
import type { AuthUser } from "../../../core/types/express";
import { ErrorCode, ErrorMessages } from "../../../core/utils/error.codes";
import type { GetTaskQueryDto, PatchTaskDto } from "../dtos";
import type { Board } from "../entities/board.interface";
import type { Task, TaskActivity } from "../entities/task.interface";
import { assignedEvent, completedEvent, deletedEvent, dueChangedEvent, reopenedEvent, restoredEvent } from "../events/task-event.factory";
import { toOutboxEvent, type TaskEventPayload } from "../events/project-events";
import type { TxContext } from "../repositories/unit-of-work";
import { defaultColumn } from "./column-lookup";
import { betweenOrRepair } from "./safe-between";
import { diffTask } from "./task-diff";
import type { TaskDetailDeps } from "./task-detail.deps";
import { computeTaskPermissions, isRestorable, toTaskDetail, type TaskDetailDto } from "./task-detail.presenter";
import { TaskPublisher } from "./task-publisher";
import { assertNewTaskRefs } from "./task-refs";
import { needsRebalance } from "./task-position";
import { presentTaskCards, type TaskCardDto } from "./task.presenter";
import { presentTaskDependencies } from "./dependency.presenter";

/** 403 `PERM_001`: thấy thẻ nhưng không được làm (bảng lưu trữ, xoá thẻ người khác khi chỉ là MEMBER…). */
const forbiddenError = (): ScopeForbiddenError => new ScopeForbiddenError(ErrorMessages[ErrorCode.PERM_001], ErrorCode.PERM_001);

interface RestoreOutcome {
  restored: boolean;
  task: Task;
  activity: TaskActivity | null;
}

interface PlannedEvent {
  payload: TaskEventPayload;
  dedupeKey: string;
}

/** Người được thấy/khôi phục thẻ ĐÃ XOÁ: người xoá, hoặc OWNER/ADMIN (`workspace.task.delete`); phải sửa được thẻ (MEMBER+). */
const mayManageDeleted = (task: Task, access: ResolvedAccess, userId: string): boolean =>
  access.actions.has("workspace.task.update") && (task.deletedBy === userId || access.actions.has("workspace.task.delete"));

/** Chi tiết thẻ: xem, sửa trường (diff → activity + outbox), xoá mềm, khôi phục (p3-03 be.md §5). */
export class TaskDetailService {
  private readonly publisher: TaskPublisher;

  constructor(private readonly d: TaskDetailDeps) {
    this.publisher = new TaskPublisher(d.emitter, d.directory, d.clock);
  }

  async get(user: AuthUser, taskId: string, query: GetTaskQueryDto): Promise<TaskDetailDto> {
    const { task, board, access } = await this.d.access.taskIncludingDeleted(user, taskId, "workspace.board.read");
    // Thẻ đã xoá chỉ lộ cho người CÓ QUYỀN khôi phục và khi client xin rõ `includeDeleted`; người khác 404 trung tính.
    if (task.deletedAt && (!query.includeDeleted || !mayManageDeleted(task, access, user.id))) throw new ScopeNotFoundError();
    return this.present(task, board, access, user.id);
  }

  async patch(user: AuthUser, taskId: string, dto: PatchTaskDto): Promise<TaskDetailDto> {
    const { task: seen, board, access } = await this.d.access.task(user, taskId, "workspace.task.update");
    await assertNewTaskRefs(
      this.d,
      board,
      (dto.assigneeIds ?? []).filter((id) => !seen.assigneeIds.includes(id)),
      (dto.labelIds ?? []).filter((id) => !seen.labelIds.includes(id))
    );
    this.assertDateOrder(dto.startDate !== undefined ? dto.startDate : seen.startDate, dto.dueDate !== undefined ? dto.dueDate : seen.dueDate);

    // (p4-04) Lùi hạn khi có thẻ sau bị ảnh hưởng → 409 TASK_006 kèm bản xem trước, KHÔNG ghi gì. Lệch version để transaction báo RES_003.
    if (dto.expectedVersion === seen.version) await this.d.reschedulePolicy?.assertPatchAllowed(seen, dto);

    const outcome = await this.d.uow.run((tx) => this.patchInTx(tx, user.id, taskId, dto));
    if (!outcome.diff) return this.present(outcome.task, board, access, user.id);

    await Promise.all([
      this.publisher.updated(outcome.task, user.id, outcome.diff.changed, dto.clientMutationId),
      this.publisher.activities(outcome.task.boardId, outcome.activities),
    ]);
    return this.present(outcome.task, board, access, user.id);
  }

  /** Xoá mềm: người tạo hoặc OWNER/ADMIN. Đổi số thẻ của cột ⇒ đi qua `BoardWriteRunner` như tạo/kéo thẻ. */
  async remove(user: AuthUser, taskId: string): Promise<void> {
    const { task: seen, access } = await this.d.access.task(user, taskId, "workspace.task.update");
    if (seen.createdBy !== user.id && !access.actions.has("workspace.task.delete")) throw forbiddenError();
    const now = this.now();

    const { after, activity } = await this.d.runner.run(seen.boardId, async (tx) => {
      const before = await this.d.tasks.findById(taskId, tx);
      if (!before || before.deletedAt) throw new ScopeNotFoundError();
      const after = await this.d.tasks.softDeleteCas(taskId, before.version, { deletedAt: now, deletedBy: user.id, deletedFromColumnId: before.columnId }, tx);
      if (!after) throw new VersionConflictError(before.version);
      const activity = await this.d.activity.record(tx, {
        taskId,
        boardId: after.boardId,
        workspaceId: after.workspaceId,
        actorId: user.id,
        type: "DELETED",
        before: { columnId: before.columnId },
        after: null,
      });
      const evt = deletedEvent(after, user.id, before.columnId);
      await this.d.outbox.add(tx, toOutboxEvent(evt.payload, evt.dedupeKey));
      return { after, activity };
    });

    this.d.emitter.taskDeleted(after.boardId, { id: taskId, actorId: user.id });
    await this.publisher.activities(after.boardId, [activity]);
  }

  /** Khôi phục về CUỐI cột cũ (cột cũ đã xoá → cột TODO đầu tiên). ≤ 30 ngày, nếu không `TASK_016` (410). Idempotent. */
  async restore(user: AuthUser, taskId: string): Promise<TaskCardDto> {
    const { task: seen, access } = await this.d.access.taskIncludingDeleted(user, taskId, "workspace.task.update");
    if (!seen.deletedAt) return this.card(seen); // đã khôi phục (bấm hai lần)
    if (!mayManageDeleted(seen, access, user.id)) throw new ScopeNotFoundError();
    const now = this.now();
    if (!isRestorable(seen, now)) throw new AppError(ErrorMessages[ErrorCode.TASK_016], 410, ErrorCode.TASK_016);
    const cfg = await this.d.config.load();

    const outcome = await this.d.runner.run(seen.boardId, (tx) => this.restoreInTx(tx, user.id, taskId, now, cfg.perBoardMax));
    if (!outcome.restored) return this.card(outcome.task);

    const card = await this.card(outcome.task);
    this.d.emitter.taskCreated(outcome.task.boardId, { task: card, actorId: user.id, clientMutationId: null, restored: true });
    if (outcome.activity) await this.publisher.activities(outcome.task.boardId, [outcome.activity]);
    if (needsRebalance(outcome.task.position)) this.d.rebalance.schedule(outcome.task.boardId, outcome.task.columnId);
    return card;
  }

  private async patchInTx(tx: TxContext, actorId: string, taskId: string, dto: PatchTaskDto) {
    const before = await this.d.tasks.findById(taskId, tx);
    if (!before || before.deletedAt) throw new ScopeNotFoundError();
    if (before.version !== dto.expectedVersion) throw new VersionConflictError(before.version);
    const board = await this.d.boards.findById(before.boardId, tx);
    if (!board) throw new ScopeNotFoundError();
    if (board.archivedAt) throw forbiddenError();

    const diff = diffTask(before, dto);
    if (Object.keys(diff.set).length === 0) return { task: before, diff: null, activities: [] as TaskActivity[] };

    const after = await this.d.tasks.patchCas(taskId, dto.expectedVersion, diff.set, tx);
    if (!after) throw new VersionConflictError((await this.d.tasks.findById(taskId, tx))?.version ?? before.version);

    const activities: TaskActivity[] = [];
    for (const a of diff.activities) {
      activities.push(
        await this.d.activity.record(tx, { taskId, boardId: after.boardId, workspaceId: after.workspaceId, actorId, type: a.type, before: a.before, after: a.after })
      );
    }
    const events = [
      diff.dueChanged ? dueChangedEvent(after, actorId, before.dueDate) : null,
      assignedEvent(after, actorId, `v${after.version}`, diff.addedAssigneeIds),
    ];
    for (const e of events) if (e) await this.d.outbox.add(tx, toOutboxEvent(e.payload, e.dedupeKey));
    return { task: after, diff, activities };
  }

  private async restoreInTx(tx: TxContext, actorId: string, taskId: string, now: Date, perBoardMax: number): Promise<RestoreOutcome> {
    const before = await this.d.tasks.findById(taskId, tx);
    if (!before) throw new ScopeNotFoundError();
    if (!before.deletedAt) return { restored: false, task: before, activity: null }; // người khác vừa khôi phục
    const board = await this.d.boards.findById(before.boardId, tx);
    if (!board) throw new ScopeNotFoundError();
    if (board.archivedAt) throw forbiddenError();
    if ((await this.d.tasks.countLive(before.boardId, tx)) >= perBoardMax) throw new AppError(ErrorMessages[ErrorCode.TASK_010], 409, ErrorCode.TASK_010);

    // Cột cũ còn → về đó; cột đã bị xoá (PUT columns) → cột TODO đầu tiên, KHÔNG lỗi.
    const column = board.columns.find((c) => c.id === before.deletedFromColumnId) ?? defaultColumn(board);
    const repair = (): void => this.d.rebalance.schedule(board.id, column.id);
    const position = betweenOrRepair(await this.d.tasks.lastPosition(board.id, column.id, undefined, tx), null, repair);

    // Bất biến: cột DONE ⇔ có `completedAt`. Về cột khác loại với lúc xoá thì hoàn thành/mở lại đúng một lần.
    const wasDone = before.completedAt !== null;
    const toDone = column.kind === "DONE";
    const completedAt = toDone ? (before.completedAt ?? now) : null;
    const completionCount = toDone && !wasDone ? before.completionCount + 1 : before.completionCount;
    // Về cột DONE mà lúc xoá thẻ CHƯA hoàn thành (cột đổi loại DONE trong lúc thẻ nằm thùng rác) = MỘT lần hoàn thành mới ⇒ cùng chính sách với `move`
    // (chấm chéo p4-05 chặn `409 TASK_002`). Thẻ vốn đã DONE khi xoá thì khôi phục lại chỗ cũ, không hoàn thành thêm ⇒ không kiểm.
    const meta = toDone && !wasDone ? await this.d.moveRegistry.runPolicies({ board, fromColumn: column, toColumn: column, actorId, now, tx, task: before }) : {};

    const after = await this.d.tasks.restoreCas(taskId, before.version, { columnId: column.id, columnKind: column.kind, position, completedAt, completionCount }, tx);
    if (!after) throw new VersionConflictError(before.version);

    const activity = await this.d.activity.record(tx, {
      taskId,
      boardId: after.boardId,
      workspaceId: after.workspaceId,
      actorId,
      type: "RESTORED",
      before: null,
      after: { columnId: column.id },
    });
    const events: PlannedEvent[] = [restoredEvent(after, actorId)];
    if (toDone && !wasDone) {
      const labels = await this.d.labels.findByBoardAndIds(after.boardId, after.labelIds, tx);
      events.push(completedEvent(after, actorId, labels.map((l) => l.name), meta.review));
    } else if (!toDone && wasDone) {
      events.push(reopenedEvent(after, actorId, now));
    }
    for (const e of events) await this.d.outbox.add(tx, toOutboxEvent(e.payload, e.dedupeKey));
    return { restored: true, task: after, activity };
  }

  private assertDateOrder(start: Date | null, due: Date | null): void {
    if (start && due && start.getTime() > due.getTime()) {
      throw new AppError(ErrorMessages[ErrorCode.TASK_013], 400, ErrorCode.TASK_013, { startDate: ["Ngày bắt đầu phải trước hạn chót"] });
    }
  }

  private async present(task: Task, board: Board, access: ResolvedAccess, userId: string): Promise<TaskDetailDto> {
    const now = this.now();
    const [users, labels, dependencies, reviews] = await Promise.all([
      this.d.directory.userSummaries(task.assigneeIds),
      this.d.labels.findByBoardAndIds(board.id, task.labelIds),
      this.dependencies(task, now),
      this.d.reviews && !task.deletedAt ? this.d.reviews.build(task, board, access, userId) : Promise.resolve(undefined),
    ]);
    return toTaskDetail(task, users, labels, computeTaskPermissions(task, access, userId, now), now, dependencies, reviews);
  }

  private async dependencies(task: Task, now: Date) {
    if (!this.d.dependencies || task.deletedAt) return undefined;
    return presentTaskDependencies(task.id, task.boardId, { dependencies: this.d.dependencies, directory: this.d.directory }, now);
  }

  private async card(task: Task): Promise<TaskCardDto> {
    return (await presentTaskCards([task], this.d.directory, this.now()))[0];
  }

  private now(): Date {
    return this.d.clock ? this.d.clock() : new Date();
  }
}
