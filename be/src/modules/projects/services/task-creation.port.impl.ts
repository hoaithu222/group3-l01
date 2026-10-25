import { ScopeForbiddenError } from "../../../core/exceptions";
import type { AuthUser } from "../../../core/types/express";
import { ErrorCode, ErrorMessages } from "../../../core/utils/error.codes";
import type { ITaskCreationPort, TaskCreationInput, TaskCreationResult } from "../../../shared/ports/task-creation.port";
import type { ProjectAccess } from "./project-access";
import type { TaskService } from "./task.service";

/**
 * Cài đặt `ITaskCreationPort` (p7-04, `shared/ports/task-creation.port.ts`) bằng CHÍNH `TaskService.create` — quyền `workspace.task.create` qua `ProjectAccess.board`, hạn mức thẻ, vị trí do
 * server tính, activity, outbox `task.created`, idempotency theo `clientTaskId`. Thẻ ghi thêm `sourceMessageRef` (THAM CHIẾU về tin, qua `TaskSeed`) và mô tả do `chat-extensions` dựng.
 */
export class TaskCreationPortImpl implements ITaskCreationPort {
  constructor(
    private readonly access: Pick<ProjectAccess, "board">,
    private readonly tasks: Pick<TaskService, "create">
  ) {}

  async assertCanCreate(actor: AuthUser, boardId: string): Promise<{ workspaceId: string }> {
    const { board } = await this.access.board(actor, boardId, "workspace.task.create");
    // Bảng đã lưu trữ: chỉ còn `board.read` ở scope BOARD nên `assert` phía trên đã chặn; kiểm thêm để lỗi rõ ràng nếu cờ lưu trữ và quyền lệch nhau.
    if (board.archivedAt) throw new ScopeForbiddenError(ErrorMessages[ErrorCode.PERM_001], ErrorCode.PERM_001);
    return { workspaceId: board.workspaceId };
  }

  async createFromMessage(input: TaskCreationInput): Promise<TaskCreationResult> {
    const created = await this.tasks.create(
      input.actor,
      input.boardId,
      {
        title: input.title,
        ...(input.columnId ? { columnId: input.columnId } : {}),
        assigneeIds: input.assigneeIds,
        labelIds: [],
        ...(input.dueDate ? { dueDate: input.dueDate } : {}),
        clientTaskId: input.clientTaskId,
      },
      { description: input.description, sourceMessageRef: input.sourceMessageRef }
    );
    return { task: { id: created.task.id, boardId: created.task.boardId, title: created.task.title }, created: created.created };
  }
}
