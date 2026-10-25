import { permissionService } from "../../../core/permission";
import type { Action } from "../../../core/permission";
import { ScopeNotFoundError } from "../../../core/exceptions";
import type { AuthUser } from "../../../core/types/express";
import type { BoardRef } from "../entities/contribution.interface";
import type { IContributionDirectory } from "../repositories/contribution-directory.repository.interface";

/**
 * Điểm kiểm quyền DUY NHẤT của báo cáo đóng góp — mọi thao tác đi qua `permissionService.assert` (scope BOARD uỷ quyền WORKSPACE cha, do module
 * `projects` đăng ký): người ngoài/khách (GUEST) → `404` trung tính (`PERM_404`), thiếu action → `403`. Không tự đọc `WorkspaceMembership`.
 *  - xem báo cáo/heatmap/xuất PDF: `workspace.board.read` (OWNER/ADMIN/MEMBER; GUEST ẩn);
 *  - đổi công thức: `workspace.board.edit` (OWNER/ADMIN; bảng đã lưu trữ chỉ còn `board.read` → 403).
 */
export class ContributionAccess {
  constructor(private readonly directory: IContributionDirectory) {}

  readBoard(user: AuthUser, boardId: string): Promise<BoardRef> {
    return this.board(user, boardId, "workspace.board.read");
  }

  editBoard(user: AuthUser, boardId: string): Promise<BoardRef> {
    return this.board(user, boardId, "workspace.board.edit");
  }

  /** Xem heatmap cả nhóm: cùng ngưỡng với xem bảng (khách không thấy hoạt động của nhóm). */
  async readWorkspace(user: AuthUser, workspaceId: string): Promise<void> {
    await permissionService.assert(user, "workspace.board.read", { type: "WORKSPACE", id: workspaceId });
  }

  /** Quyền đọc bảng KHÔNG ném lỗi — cho resolver quyền đọc asset PDF. */
  canReadBoard(user: AuthUser, boardId: string): Promise<boolean> {
    return permissionService.can(user, "workspace.board.read", { type: "BOARD", id: boardId });
  }

  private async board(user: AuthUser, boardId: string, action: Action): Promise<BoardRef> {
    await permissionService.assert(user, action, { type: "BOARD", id: boardId });
    const board = await this.directory.getBoard(boardId);
    if (!board) throw new ScopeNotFoundError();
    return board;
  }
}
