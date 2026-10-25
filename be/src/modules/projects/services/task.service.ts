import { AppError, ScopeForbiddenError, ScopeNotFoundError, ValidationError } from "../../../core/exceptions";
import type { AuthUser } from "../../../core/types/express";
import { ErrorCode, ErrorMessages } from "../../../core/utils/error.codes";
import { normalizeSearch } from "../../../core/utils/normalize";
import type { Board, BoardColumn } from "../entities/board.interface";
import type { Task, TaskListFilter, TaskSeed } from "../entities/task.interface";
import { assignedEvent, completedEvent, createdEvent, dueChangedEvent } from "../events/task-event.factory";
import { toOutboxEvent, type TaskEventPayload, type TaskReviewMeta } from "../events/project-events";
import type { CreateTaskDto, ListTasksQueryDto } from "../dtos";
import type { TxContext } from "../repositories/unit-of-work";
import { defaultColumn, findColumn } from "./column-lookup";
import type { TaskServiceDeps } from "./task-service.deps";
import { betweenOrRepair } from "./safe-between";
import { needsRebalance } from "./task-position";
import { presentTaskCards, type TaskCardDto } from "./task.presenter";

export interface CreateTaskResult {
  task: TaskCardDto;
  /** `false` khi `clientTaskId` đã tạo thẻ này trước đó (replay idempotent). */
  created: boolean;
}

export interface TaskListResult {
  columns: { columnId: string; tasks: TaskCardDto[]; hasMore: boolean }[];
}

const archivedError = (): ScopeForbiddenError => new ScopeForbiddenError(ErrorMessages[ErrorCode.PERM_001], ErrorCode.PERM_001);

/** Danh sách theo cột (lọc) + tạo thẻ (idempotent, vị trí server). Kéo thẻ ở `TaskMoveService`. */
export class TaskService {
  constructor(private readonly d: TaskServiceDeps) {}

  async list(user: AuthUser, boardId: string, query: ListTasksQueryDto): Promise<TaskListResult> {
    const { board } = await this.d.access.board(user, boardId, "workspace.board.read");
    const columns = query.columnId ? [findColumn(board, query.columnId)] : board.columns;
    const filter: TaskListFilter = {
      assigneeId: query.assigneeId === "me" ? user.id : query.assigneeId,
      labelId: query.labelId,
      overdue: query.overdue,
      dueBefore: query.dueBefore,
      q: query.q ? normalizeSearch(query.q) : undefined,
    };
    const now = new Date();
    const limit = query.limitPerColumn;

    const perColumn = await Promise.all(
      columns.map(async (c) => ({ columnId: c.id, rows: await this.d.tasks.listColumn(boardId, c.id, filter, limit + 1, now) }))
    );
    // Một lần tra tên người cho MỌI thẻ của trang (không N+1).
    const visible = perColumn.flatMap((c) => c.rows.slice(0, limit));
    const cards = new Map((await presentTaskCards(visible, this.d.directory, now)).map((card) => [card.id, card]));
    await this.attachReviewProgress(visible, cards);
    return {
      columns: perColumn.map((c) => ({
        columnId: c.columnId,
        tasks: c.rows.slice(0, limit).map((t) => cards.get(t.id) as TaskCardDto),
        hasMore: c.rows.length > limit,
      })),
    };
  }

  /** `seed` (sao chép thẻ, p3-03 P1): mô tả/ngày bắt đầu/điểm/checklist đặt sẵn — ngoài `CreateTaskDto` của route. */
  async create(user: AuthUser, boardId: string, dto: CreateTaskDto, seed?: TaskSeed): Promise<CreateTaskResult> {
    const { board } = await this.d.access.board(user, boardId, "workspace.task.create");
    await this.assertRefs(board, dto);
    const cfg = await this.d.config.load();
    const now = new Date();

    const outcome = await this.d.runner.run(boardId, async (tx) => {
      const existing = dto.clientTaskId
        ? await this.d.tasks.findByClientTaskId(boardId, user.id, dto.clientTaskId, tx)
        : null;
      if (existing) return { task: existing, created: false };

      // Đọc lại bảng TRONG giao dịch (đã `touch`): cột/lưu trữ nhất quán với PUT columns/archive đồng thời.
      const fresh = await this.d.boards.findById(boardId, tx);
      if (!fresh) throw new ScopeNotFoundError();
      if (fresh.archivedAt) throw archivedError();
      const column = dto.columnId ? findColumn(fresh, dto.columnId) : defaultColumn(fresh);
      if ((await this.d.tasks.countLive(boardId, tx)) >= cfg.perBoardMax) {
        throw new AppError(ErrorMessages[ErrorCode.TASK_010], 409, ErrorCode.TASK_010);
      }

      const position = await this.positionFor(fresh, column, dto.afterTaskId, tx);
      const done = column.kind === "DONE";
      const task = await this.d.tasks.create(
        {
          boardId,
          workspaceId: board.workspaceId,
          columnId: column.id,
          columnKind: column.kind,
          position,
          title: dto.title,
          normalizedTitle: normalizeSearch(dto.title),
          assigneeIds: dto.assigneeIds,
          labelIds: dto.labelIds,
          dueDate: dto.dueDate ?? null,
          dueVersion: dto.dueDate ? 1 : 0,
          // Bất biến: cột DONE ⇔ có `completedAt`. Tạo thẳng vào DONE = một lần hoàn thành.
          completedAt: done ? now : null,
          completionCount: done ? 1 : 0,
          createdBy: user.id,
          clientTaskId: dto.clientTaskId ?? null,
          ...seed,
        },
        tx
      );
      // Tạo thẳng vào DONE cũng là MỘT lần hoàn thành ⇒ cùng chính sách với `move` (chấm chéo p4-05 chặn `409 TASK_002`). Ném lỗi ⇒ transaction
      // rollback, không để lại thẻ mồ côi; metadata policy (`review`) vào payload `task.completed`.
      const meta = done ? await this.d.moveRegistry.runPolicies({ board: fresh, fromColumn: column, toColumn: column, actorId: user.id, now, tx, task }) : {};
      await this.recordCreated(tx, task, user.id, meta.review);
      return { task, created: true };
    });

    const [card] = await presentTaskCards([outcome.task], this.d.directory, now);
    if (outcome.created) {
      this.d.emitter.taskCreated(boardId, { task: card, actorId: user.id, clientMutationId: dto.clientMutationId ?? null });
      if (needsRebalance(outcome.task.position)) this.d.rebalance.schedule(boardId, outcome.task.columnId);
    }
    return { task: card, created: outcome.created };
  }

  /** (p4-05) Thẻ đang chờ duyệt kèm tiến độ lượt mở "1/2" — MỘT truy vấn theo `activeKey` cho cả trang. */
  private async attachReviewProgress(tasks: Task[], cards: Map<string, TaskCardDto>): Promise<void> {
    const pending = tasks.filter((t) => t.reviewState === "PENDING").map((t) => t.id);
    if (!this.d.reviewProgress || pending.length === 0) return;
    const progress = await this.d.reviewProgress.progressOf(pending);
    for (const id of pending) {
      const card = cards.get(id);
      if (card) card.review = progress.get(id) ?? null;
    }
  }

  /** Người làm phải là thành viên ACTIVE (không GUEST); nhãn phải thuộc bảng — trả 400 kèm danh sách id sai. */
  private async assertRefs(board: Board, dto: CreateTaskDto): Promise<void> {
    const [members, labels] = await Promise.all([
      this.d.directory.activeMemberIds(board.workspaceId, dto.assigneeIds),
      this.d.labels.findByBoardAndIds(board.id, dto.labelIds),
    ]);
    const invalidAssigneeIds = dto.assigneeIds.filter((id) => !members.has(id));
    const knownLabels = new Set(labels.map((l) => l.id));
    const invalidLabelIds = dto.labelIds.filter((id) => !knownLabels.has(id));
    if (invalidAssigneeIds.length > 0 || invalidLabelIds.length > 0) {
      throw new ValidationError("Người làm hoặc nhãn không hợp lệ", {
        ...(invalidAssigneeIds.length > 0 && { invalidAssigneeIds }),
        ...(invalidLabelIds.length > 0 && { invalidLabelIds }),
      });
    }
  }

  /** Cuối cột (mặc định) hoặc NGAY SAU `afterTaskId` (giữa nó và hàng xóm hiện tại phía sau). */
  private async positionFor(board: Board, column: BoardColumn, afterTaskId: string | undefined, tx: TxContext): Promise<string> {
    const repair = (): void => this.d.rebalance.schedule(board.id, column.id);
    if (!afterTaskId) return betweenOrRepair(await this.d.tasks.lastPosition(board.id, column.id, undefined, tx), null, repair);
    const after = await this.d.tasks.findById(afterTaskId, tx);
    if (!after || after.deletedAt || after.boardId !== board.id || after.columnId !== column.id) {
      throw new ValidationError("Thẻ liền trước không thuộc cột này", { afterTaskId: ["Không thuộc cột đích"] });
    }
    const next = await this.d.tasks.adjacent(board.id, column.id, after.position, "after", undefined, tx);
    return betweenOrRepair(after.position, next?.position ?? null, repair);
  }

  private async recordCreated(tx: TxContext, task: Task, actorId: string, review?: TaskReviewMeta): Promise<void> {
    await this.d.activity.record(tx, {
      taskId: task.id,
      boardId: task.boardId,
      workspaceId: task.workspaceId,
      actorId,
      type: "CREATED",
      before: null,
      after: { columnId: task.columnId, columnKind: task.columnKind },
    });
    const events: ({ payload: TaskEventPayload; dedupeKey: string } | null)[] = [
      createdEvent(task, actorId),
      assignedEvent(task, actorId, "create"),
    ];
    if (task.dueDate) events.push(dueChangedEvent(task, actorId, null));
    if (task.completedAt) {
      const labels = await this.d.labels.findByBoardAndIds(task.boardId, task.labelIds, tx);
      events.push(completedEvent(task, actorId, labels.map((l) => l.name), review));
    }
    for (const e of events) if (e) await this.d.outbox.add(tx, toOutboxEvent(e.payload, e.dedupeKey));
  }
}
