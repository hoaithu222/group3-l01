import { registerScopeResolver } from "../../../core/permission";
import type { Action, ResolvedAccess, ScopeRef } from "../../../core/permission";
import { resolveCollabAbilities, type CollabAbility, type CollabWorkspaceRole } from "../../../shared/collab";
import type { ICollaboratorRepository } from "../repositories/collaborator.repository.interface";
import type { IWhiteboardDirectory } from "../repositories/whiteboard-directory.interface";
import type { IWhiteboardRepository } from "../repositories/whiteboard.repository.interface";

/** `CollabAbility` (dùng chung tài liệu/bảng trắng) → `Action` của scope WHITEBOARD. */
export const ACTION_OF_ABILITY: Record<CollabAbility, Action> = {
  read: "whiteboard.read",
  edit: "whiteboard.edit",
  manage: "whiteboard.manage",
  snapshot: "whiteboard.snapshot",
  restore: "whiteboard.restore",
};

const INVISIBLE: ResolvedAccess = { visible: false, role: null, actions: new Set() };

export interface WhiteboardAccessDeps {
  whiteboards: Pick<IWhiteboardRepository, "findById">;
  collaborators: Pick<ICollaboratorRepository, "find">;
  directory: Pick<IWhiteboardDirectory, "workspaceStatus">;
}

/**
 * Resolver scope `WHITEBOARD` (p6-02 be.md §5 `WhiteboardAccessService.resolve`): uỷ quyền WORKSPACE cha bằng `ctx.resolve` (kiểm thành viên ACTIVE, khách hết hạn…) rồi áp
 * ma trận thuần DÙNG CHUNG `resolveCollabAbilities` (WORKSPACE/PRIVATE × vai × ACTIVE/ARCHIVED — cùng bộ ca với tài liệu). Trả lại `role` của cha để `assert` xử lý khách;
 * `versionDeps: [WORKSPACE]` nên đổi thành viên/thu hồi quyền ở nhóm tự vô hiệu cache bảng mà không cần bump từng cái. Đổi cộng tác viên/visibility/lưu trữ bảng → service
 * gọi `permissionService.bumpVersion({ type: "WHITEBOARD", id })`.
 */
export function registerWhiteboardScopeResolver(deps: WhiteboardAccessDeps): void {
  registerScopeResolver({
    type: "WHITEBOARD",
    async resolve(user, whiteboardId, ctx): Promise<ResolvedAccess> {
      const board = await deps.whiteboards.findById(whiteboardId);
      if (!board) return INVISIBLE;
      const parent: ScopeRef = { type: "WORKSPACE", id: board.workspaceId };
      const [ws, collaborator, workspaceStatus] = await Promise.all([
        ctx.resolve(user, parent),
        deps.collaborators.find(whiteboardId, user.id),
        deps.directory.workspaceStatus(board.workspaceId),
      ]);
      if (!ws.visible) return INVISIBLE;

      const abilities = resolveCollabAbilities({
        userId: user.id,
        visibility: board.visibility,
        resourceStatus: board.status,
        createdBy: board.createdBy,
        collaboratorRole: collaborator?.role ?? null,
        workspaceRole: ws.role as CollabWorkspaceRole | null,
        workspaceActive: workspaceStatus === "ACTIVE",
      });
      if (!abilities) return INVISIBLE;

      return {
        visible: true,
        role: ws.role,
        actions: new Set<Action>([...abilities].map((a) => ACTION_OF_ABILITY[a])),
        parent,
        versionDeps: [parent],
        ...(ws.expiresAt ? { expiresAt: ws.expiresAt } : {}),
      };
    },
  });
}
