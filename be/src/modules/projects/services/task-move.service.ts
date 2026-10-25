import { AppError, ScopeForbiddenError, ScopeNotFoundError, ValidationError } from "../../../core/exceptions";
import type { AuthUser } from "../../../core/types/express";
import { ErrorCode, ErrorMessages } from "../../../core/utils/error.codes";
import type { Board, BoardColumn } from "../entities/board.interface";
import type { Task, TaskActivity } from "../entities/task.interface";
import { completedEvent, reopenedEvent } from "../events/task-event.factory";
import { toOutboxEvent } from "../events/project-events";
import type { MoveTaskDto } from "../dtos";
import type { TxContext } from "../repositories/unit-of-work";
import { findColumn } from "./column-lookup";
import type { TaskServiceDeps } from "./task-service.deps";
import { betweenOrRepair } from "./safe-between";
import { needsRebalance } from "./task-position";
import { toTaskMoveResult, type TaskMoveResultDto } from "./task.presenter";

export interface MoveOutcome {
  before: Task;
  after: Task;
  /** Dòng nhật ký `MOVED` vừa ghi (`null` khi chỉ đổi thứ tự trong cùng cột) — caller hệ thống dùng để phát `task:activity`. */
  activity: TaskActivity | null;
}

/** Đích của một lần chuyển thẻ do HỆ THỐNG khởi tạo (không có `clientMutationId`, đặt cuối cột đích). */
export interface SystemMoveInput {
  columnId: string;
  expectedVersion: number;
}

const invalidNeighbor = (field: "afterTaskId" | "beforeTaskId"): ValidationError =>
  new ValidationError("Thẻ liền kề không thuộc cột đích", { [field]: ["Không thuộc cột đích hoặc đã bị xoá"] });

/**
 * Kéo thẻ (p3-02 be.md §5 "Move"). Toàn bộ nằm trong MỘT transaction đã `touch(board)` (xem `BoardWriteRunner`):
 * CAS theo `version` → tính khoá giữa hai hàng xóm HIỆN TẠI (client chỉ gửi id hàng xóm) → policy vào DONE → ghi →
 * activity → effect → outbox. Sau commit mới phát realtime và (khi khoá dài) xếp job nén cột.
 */
export class TaskMoveService {
  constructor(private readonly d: TaskServiceDeps) {}

  async move(user: AuthUser, taskId: string, dto: MoveTaskDto): Promise<TaskMoveResultDto> {
    const { task: seen } = await this.d.access.task(user, taskId, "workspace.task.status");

    const { before, after } = await this.d.runner.run(seen.boardId, (tx) => this.moveInTx(tx, user.id, taskId, dto));

    this.d.emitter.taskMoved(after.boardId, {
      id: after.id,
      boardId: after.boardId,
      fromColumnId: before.columnId,
      columnId: after.columnId,
      columnKind: after.columnKind,
      position: after.position,
      version: after.version,
      completedAt: after.completedAt ? after.completedAt.toISOString() : null,
      actorId: user.id,
      clientMutationId: dto.clientMutationId,
    });
    if (needsRebalance(after.position)) this.d.rebalance.schedule(after.boardId, after.columnId);
    return toTaskMoveResult(after);
  }

  /**
   * Chuyển thẻ do HỆ THỐNG (actor `null`) TRONG transaction đang mở của caller — cùng đường với `move`: CAS `version`, policy vào DONE
   * (`ReviewDonePolicy`…), effect, activity `MOVED`, outbox `task.completed`. Caller phải đang ở `BoardWriteRunner.run(boardId, …)` và tự
   * phát realtime sau commit. Ném lỗi (policy chặn, `RES_003`) ⇒ cả transaction của caller rollback.
   */
  moveAsSystem(tx: TxContext, taskId: string, input: SystemMoveInput): Promise<MoveOutcome> {
    return this.moveInTx(tx, null, taskId, { ...input, afterTaskId: null, beforeTaskId: null, clientMutationId: "system-move" });
  }

  private async moveInTx(tx: TxContext, actorId: string | null, taskId: string, dto: MoveTaskDto): Promise<MoveOutcome> {
    const now = new Date();
    const task = await this.d.tasks.findById(taskId, tx);
    if (!task || task.deletedAt) throw new ScopeNotFoundError();
    if (task.version !== dto.expectedVersion) throw this.conflict(task);

    const board = await this.d.boards.findById(task.boardId, tx);
    if (!board) throw new ScopeNotFoundError();
    if (board.archivedAt) throw new ScopeForbiddenError(ErrorMessages[ErrorCode.PERM_001], ErrorCode.PERM_001);

    const toColumn = findColumn(board, dto.columnId);
    // Cột nguồn có thể đã bị PUT columns xoá khi thẻ đã xoá mềm — dựng cột giả theo `columnKind` đang lưu.
    const fromColumn: BoardColumn =
      board.columns.find((c) => c.id === task.columnId) ??
      { id: task.columnId, title: "", kind: task.columnKind, order: -1, wipLimit: null };

    const position = await this.resolvePosition(board, toColumn, task.id, dto, tx);
    const entering = toColumn.kind === "DONE" && task.columnKind !== "DONE";
    const leaving = task.columnKind === "DONE" && toColumn.kind !== "DONE";
    const ctxBase = { board, fromColumn, toColumn, actorId, now, tx };

    // Policy chặn/bổ sung metadata TRƯỚC khi ghi (Phase 3: registry rỗng).
    const meta = entering ? await this.d.moveRegistry.runPolicies({ ...ctxBase, task }) : {};

    const after = await this.d.tasks.moveCas(
      task.id,
      dto.expectedVersion,
      {
        columnId: toColumn.id,
        columnKind: toColumn.kind,
        position,
        completedAt: entering ? now : leaving ? null : task.completedAt,
        completionCount: entering ? task.completionCount + 1 : task.completionCount,
      },
      tx
    );
    // Đua giữa bước đọc và ghi: trả trạng thái mới nhất để client hoàn tác.
    if (!after) throw this.conflict((await this.d.tasks.findById(taskId, tx)) ?? task);

    // Chỉ ghi nhật ký khi ĐỔI CỘT — đổi thứ tự trong cùng cột không phải hoạt động đáng ghi.
    const activity =
      task.columnId !== toColumn.id
        ? await this.d.activity.record(tx, {
            taskId: task.id,
            boardId: task.boardId,
            workspaceId: task.workspaceId,
            actorId,
            type: "MOVED",
            before: { columnId: task.columnId, columnKind: task.columnKind },
            after: { columnId: toColumn.id, columnKind: toColumn.kind },
          })
        : null;
    await this.d.moveRegistry.runEffects({ ...ctxBase, before: task, after });

    if (entering) {
      const labels = await this.d.labels.findByBoardAndIds(after.boardId, after.labelIds, tx);
      const evt = completedEvent(after, actorId, labels.map((l) => l.name), meta.review);
      await this.d.outbox.add(tx, toOutboxEvent(evt.payload, evt.dedupeKey));
    } else if (leaving) {
      const evt = reopenedEvent(after, actorId, now);
      await this.d.outbox.add(tx, toOutboxEvent(evt.payload, evt.dedupeKey));
    }
    return { before: task, after, activity };
  }

  /**
   * Khoá vị trí trong cột đích — CHỈ mốc thực sự dùng mới phải hợp lệ:
   * 1. `afterTaskId` hợp lệ → ngay SAU thẻ đó (bỏ qua hẳn `beforeTaskId`, không kiểm);
   * 2. không thì `beforeTaskId` hợp lệ → ngay TRƯỚC thẻ đó;
   * 3. có gửi mốc mà không mốc nào hợp lệ → 400 `VAL_001` theo `afterTaskId` (nếu có gửi), không thì theo `beforeTaskId`;
   * 4. cả hai `null` → cuối cột.
   * "Hợp lệ" = còn sống, khác chính thẻ đang kéo, cùng bảng, đang ở cột đích. ⚠️ Không đòi CẢ HAI mốc hợp lệ: khoá chỉ tính từ MỘT mốc
   * + hàng xóm HIỆN TẠI của nó (bỏ qua thẻ đang kéo), nên mốc kia vừa bị người khác kéo/xoá không được làm hỏng cú thả (thẻ bật về
   * chỗ cũ); dữ liệu cũ của client cũng không sinh khoá trùng/đảo thứ tự.
   */
  private async resolvePosition(board: Board, column: BoardColumn, movingId: string, dto: MoveTaskDto, tx: TxContext): Promise<string> {
    // Tra mốc KHÔNG ném: `null` = không dùng được (không gửi / không tồn tại / đã xoá mềm / chính thẻ đang kéo / khác bảng / khác cột đích).
    const anchor = async (id: string | null): Promise<Task | null> => {
      if (!id) return null;
      const t = await this.d.tasks.findById(id, tx);
      return t && !t.deletedAt && t.id !== movingId && t.boardId === board.id && t.columnId === column.id ? t : null;
    };

    const repair = (): void => this.d.rebalance.schedule(board.id, column.id);
    const after = await anchor(dto.afterTaskId);
    if (after) {
      const next = await this.d.tasks.adjacent(board.id, column.id, after.position, "after", movingId, tx);
      return betweenOrRepair(after.position, next?.position ?? null, repair);
    }
    // Chỉ tra `beforeTaskId` khi `afterTaskId` không dùng được (lười — đỡ một lượt đọc ở đường thường gặp).
    const before = await anchor(dto.beforeTaskId);
    if (before) {
      const prev = await this.d.tasks.adjacent(board.id, column.id, before.position, "before", movingId, tx);
      return betweenOrRepair(prev?.position ?? null, before.position, repair);
    }
    if (dto.afterTaskId) throw invalidNeighbor("afterTaskId");
    if (dto.beforeTaskId) throw invalidNeighbor("beforeTaskId");
    return betweenOrRepair(await this.d.tasks.lastPosition(board.id, column.id, movingId, tx), null, repair);
  }

  /** `RES_003` kèm `details.current` = trạng thái server để client hoàn tác optimistic. */
  private conflict(task: Task): AppError {
    return new AppError(ErrorMessages[ErrorCode.RES_003], 409, ErrorCode.RES_003, {
      currentVersion: task.version,
      current: toTaskMoveResult(task),
    });
  }
}
