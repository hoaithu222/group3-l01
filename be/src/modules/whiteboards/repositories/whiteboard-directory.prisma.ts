import { prisma } from "../../../infrastructure/database";
import type { PersonRef } from "../entities/whiteboard.interface";
import type { DirectoryUser, IWhiteboardDirectory, WorkspaceRoleValue } from "./whiteboard-directory.interface";

/** Đọc thẳng model của module khác bằng Prisma dùng chung (chỉ đọc, chỉ các trường an toàn) — thay cho import chéo module. */
export class PrismaWhiteboardDirectory implements IWhiteboardDirectory {
  async workspaceStatus(workspaceId: string): Promise<string | null> {
    const ws = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { status: true } });
    return ws?.status ?? null;
  }

  async activeMemberIds(workspaceId: string): Promise<string[]> {
    const rows = await prisma.workspaceMembership.findMany({
      where: { workspaceId, status: "ACTIVE", role: { in: ["OWNER", "ADMIN", "MEMBER"] } },
      select: { userId: true },
    });
    return rows.map((r) => r.userId);
  }

  async activeRoles(workspaceId: string, userIds: string[]): Promise<Map<string, WorkspaceRoleValue>> {
    if (userIds.length === 0) return new Map();
    const now = new Date();
    const rows = await prisma.workspaceMembership.findMany({
      where: { workspaceId, userId: { in: userIds }, status: "ACTIVE" },
      select: { userId: true, role: true, expiresAt: true },
    });
    // Khách hết hạn coi như không còn là thành viên (khớp resolver WORKSPACE).
    return new Map(rows.filter((r) => r.role !== "GUEST" || !r.expiresAt || r.expiresAt > now).map((r) => [r.userId, r.role]));
  }

  async users(ids: string[]): Promise<Map<string, PersonRef>> {
    if (ids.length === 0) return new Map();
    const rows = await prisma.user.findMany({ where: { id: { in: [...new Set(ids)] } }, select: { id: true, name: true } });
    return new Map(rows.map((r) => [r.id, { id: r.id, name: r.name }]));
  }

  async user(id: string): Promise<DirectoryUser | null> {
    const row = await prisma.user.findUnique({ where: { id }, select: { id: true, name: true, status: true, sessionVersion: true } });
    return row ? { id: row.id, name: row.name, status: row.status, sessionVersion: row.sessionVersion } : null;
  }
}
