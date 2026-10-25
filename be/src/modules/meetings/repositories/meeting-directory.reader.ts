import { prisma } from "../../../infrastructure/database";

export type WorkspaceRoleValue = "OWNER" | "ADMIN" | "MEMBER" | "GUEST";

/**
 * Đọc CHỈ-ĐỌC dữ kiện của module khác (thành viên workspace, người dùng) cho `meetings` — cùng cách `calls`/`read-state`:
 * repository của module đọc thẳng collection thay vì import service module kia. Quyền vẫn đi qua `PermissionService`; đây chỉ là
 * kiểm "người được mời có phải thành viên ACTIVE" (MEET_014) và lấy tên/email/ảnh để dựng DTO, email `.ics`.
 */
export interface MeetingUserInfo {
  name: string;
  email: string;
  /** Ảnh đại diện (`User.avatarAssetId`) — mapper đổi sang URL bằng `avatarUrlOf`; `null` = chưa đặt ảnh / đã ẩn danh hoá. */
  avatarAssetId: string | null;
}

export interface IMeetingDirectory {
  getWorkspace(id: string): Promise<{ id: string; name: string; status: string } | null>;
  /** Vai trò workspace của các user là thành viên ACTIVE (user không phải thành viên ACTIVE bị bỏ khỏi map). */
  getActiveMemberRoles(workspaceId: string, userIds: string[]): Promise<Map<string, WorkspaceRoleValue>>;
  getMyActiveWorkspaces(userId: string): Promise<Array<{ workspaceId: string; role: WorkspaceRoleValue }>>;
  getUsers(userIds: string[]): Promise<Map<string, MeetingUserInfo>>;
}

export class PrismaMeetingDirectory implements IMeetingDirectory {
  async getWorkspace(id: string): Promise<{ id: string; name: string; status: string } | null> {
    return prisma.workspace.findUnique({ where: { id }, select: { id: true, name: true, status: true } });
  }

  async getActiveMemberRoles(workspaceId: string, userIds: string[]): Promise<Map<string, WorkspaceRoleValue>> {
    if (userIds.length === 0) return new Map();
    const rows = await prisma.workspaceMembership.findMany({
      where: { workspaceId, userId: { in: userIds }, status: "ACTIVE" },
      select: { userId: true, role: true },
    });
    return new Map(rows.map((r) => [r.userId, r.role]));
  }

  async getMyActiveWorkspaces(userId: string): Promise<Array<{ workspaceId: string; role: WorkspaceRoleValue }>> {
    const rows = await prisma.workspaceMembership.findMany({ where: { userId, status: "ACTIVE" }, select: { workspaceId: true, role: true } });
    return rows;
  }

  async getUsers(userIds: string[]): Promise<Map<string, MeetingUserInfo>> {
    const ids = [...new Set(userIds)];
    if (ids.length === 0) return new Map();
    // `avatarAssetId` đi CÙNG truy vấn tên/email (không thêm lượt đọc nào).
    const rows = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, email: true, avatarAssetId: true } });
    return new Map(rows.map((r) => [r.id, { name: r.name, email: r.email, avatarAssetId: r.avatarAssetId }]));
  }
}
