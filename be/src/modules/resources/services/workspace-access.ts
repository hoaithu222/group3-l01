import { permissionService, type Action, type ResolvedAccess } from "../../../core/permission";
import type { AuthUser } from "../../../core/types/express";

/**
 * Cổng kiểm quyền workspace cho kho tài liệu — MỘT chỗ gọi `permissionService.assert` (p0-02), không tự đọc
 * membership. GUEST thiếu action Phase 3 → `PERM_404` (D-28 mục 6); workspace ARCHIVED giữ lại `resource.read`
 * còn mọi action ghi biến mất → 403 `PERM_001`.
 */
export interface IWorkspaceAccess {
  assert(user: AuthUser, action: Action, workspaceId: string): Promise<ResolvedAccess>;
}

export class PermissionWorkspaceAccess implements IWorkspaceAccess {
  assert(user: AuthUser, action: Action, workspaceId: string): Promise<ResolvedAccess> {
    return permissionService.assert(user, action, { type: "WORKSPACE", id: workspaceId });
  }
}

/**
 * Sửa/xoá/di chuyển tệp hoặc thư mục: của MÌNH chỉ cần `workspace.folder.manage` (MEMBER+); của NGƯỜI KHÁC cần
 * `workspace.resource.delete` (OWNER/ADMIN) — ma trận README p3-01 §6, kiểm sở hữu ở service (D-28).
 */
export function modifyActionFor(user: AuthUser, ownerId: string): Action {
  return ownerId === user.id ? "workspace.folder.manage" : "workspace.resource.delete";
}

/** OWNER/ADMIN = có `workspace.resource.delete` (xoá thư mục có nội dung, khôi phục của người khác, xoá vĩnh viễn). */
export function isPrivileged(access: ResolvedAccess): boolean {
  return access.actions.has("workspace.resource.delete");
}

/** Server tính sẵn "người xem có sửa/xoá được mục này không" — client không tự suy từ vai trò (02-conventions §2). */
export function canModify(access: ResolvedAccess, user: AuthUser, ownerId: string): boolean {
  return access.actions.has(modifyActionFor(user, ownerId));
}
