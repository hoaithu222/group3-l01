import { permissionService } from "../../../core/permission";
import { ScopeForbiddenError, ScopeNotFoundError } from "../../../core/exceptions";
import { ErrorCode, ErrorMessages } from "../../../core/utils/error.codes";
import type { AuthUser } from "../../../core/types/express";
import type { IMentorAccess, WorkspaceRole } from "./mentor.deps";

/** Bản thật — vai trò workspace qua resolver `WORKSPACE` (khách hết hạn → không thấy ngay nhờ `ResolvedAccess.expiresAt`). */
export class PermissionMentorAccess implements IMentorAccess {
  async workspaceRole(user: AuthUser, workspaceId: string): Promise<WorkspaceRole | null> {
    const access = await permissionService.resolve(user, { type: "WORKSPACE", id: workspaceId });
    if (!access.visible || !access.role) return null;
    return access.role as WorkspaceRole;
  }

  canManageChannel(user: AuthUser, channelId: string): Promise<boolean> {
    return permissionService.can(user, "channel.manage", { type: "CHANNEL", id: channelId });
  }
}

export const isWorkspaceAdmin = (role: WorkspaceRole | null): boolean => role === "OWNER" || role === "ADMIN";

/**
 * OWNER/ADMIN của nhóm sở hữu bài (ma trận quyền README §6). Không thấy nhóm/khách → 404 trung tính (khách không được biết chức
 * năng tồn tại, p3-04); thành viên thường → 403 `PERM_001` (giống `requireWorkspaceRole("ADMIN")`).
 */
export async function assertWorkspaceAdmin(access: IMentorAccess, user: AuthUser, workspaceId: string): Promise<WorkspaceRole> {
  const role = await access.workspaceRole(user, workspaceId);
  if (!role || role === "GUEST") throw new ScopeNotFoundError();
  if (!isWorkspaceAdmin(role)) throw new ScopeForbiddenError(ErrorMessages[ErrorCode.PERM_001], ErrorCode.PERM_001);
  return role;
}
