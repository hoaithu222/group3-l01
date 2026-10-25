import { permissionService } from "../../../core/permission";
import type { Action, ResolvedAccess } from "../../../core/permission";
import { ScopeNotFoundError } from "../../../core/exceptions";
import type { AuthUser } from "../../../core/types/express";
import type { Board } from "../entities/board.interface";
import type { Label } from "../entities/label.interface";
import type { Task } from "../entities/task.interface";
import type { IBoardRepository } from "../repositories/board.repository.interface";
import type { ILabelRepository } from "../repositories/label.repository.interface";
import type { ITaskRepository } from "../repositories/task.repository.interface";

/**
 * Điểm kiểm quyền duy nhất của phân hệ Dự án (dùng chung p3-03/p4-*): mọi thao tác trên bảng/thẻ/nhãn đi qua
 * `permissionService.assert` với scope `BOARD` (uỷ quyền WORKSPACE cha). Thiếu bảng/thẻ/nhãn ≡ không có quyền → 404
 * trung tính `PERM_404` (không phân biệt "không tồn tại" với "không được thấy"); GUEST → 404 nhờ `GUEST_HIDDEN_ACTIONS`.
 */
export class ProjectAccess {
  constructor(
    private readonly boards: IBoardRepository,
    private readonly tasks: ITaskRepository,
    private readonly labels: ILabelRepository
  ) {}

  /** Quyền trên WORKSPACE (danh sách/tạo bảng — chưa có bảng để kiểm). */
  workspace(user: AuthUser, workspaceId: string, action: Action): Promise<ResolvedAccess> {
    return permissionService.assert(user, action, { type: "WORKSPACE", id: workspaceId });
  }

  async board(user: AuthUser, boardId: string, action: Action): Promise<{ board: Board; access: ResolvedAccess }> {
    const access = await permissionService.assert(user, action, { type: "BOARD", id: boardId });
    const board = await this.boards.findById(boardId);
    if (!board) throw new ScopeNotFoundError();
    return { board, access };
  }

  /**
   * Quyền trên WORKSPACE cha của bảng — cho `archive`/`restore` (bảng đã lưu trữ chỉ còn `board.read` ở scope BOARD
   * nên không thể tự khôi phục qua scope đó).
   */
  async boardViaWorkspace(user: AuthUser, boardId: string, action: Action): Promise<Board> {
    const board = await this.boards.findById(boardId);
    if (!board) throw new ScopeNotFoundError();
    await this.workspace(user, board.workspaceId, action);
    return board;
  }

  async task(
    user: AuthUser,
    taskId: string,
    action: Action
  ): Promise<{ task: Task; board: Board; access: ResolvedAccess }> {
    const task = await this.tasks.findById(taskId);
    if (!task || task.deletedAt) throw new ScopeNotFoundError();
    const { board, access } = await this.board(user, task.boardId, action);
    return { task, board, access };
  }

  /**
   * Như `task()` nhưng thẻ đã xoá mềm VẪN trả về (người gọi tự quyết ai được thấy) — cho `GET ?includeDeleted=true` và
   * `restore` (p3-03). Không có thẻ / không có quyền trên bảng → 404 trung tính như `task()`.
   */
  async taskIncludingDeleted(
    user: AuthUser,
    taskId: string,
    action: Action
  ): Promise<{ task: Task; board: Board; access: ResolvedAccess }> {
    const task = await this.tasks.findById(taskId);
    if (!task) throw new ScopeNotFoundError();
    const { board, access } = await this.board(user, task.boardId, action);
    return { task, board, access };
  }

  async label(
    user: AuthUser,
    labelId: string,
    action: Action
  ): Promise<{ label: Label; board: Board; access: ResolvedAccess }> {
    const label = await this.labels.findById(labelId);
    if (!label) throw new ScopeNotFoundError();
    const { board, access } = await this.board(user, label.boardId, action);
    return { label, board, access };
  }
}
