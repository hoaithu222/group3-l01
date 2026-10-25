import { prisma } from "../../../infrastructure/database";
import { safeTimeZone } from "../../../core/utils/local-date";
import type { GamUser } from "../entities/gamification.interface";

/**
 * Tra cứu người dùng/nhóm cho gamification — CHỈ các trường cần (không email/điện thoại). Thành viên nhóm ở đây là ACTIVE và KHÔNG phải
 * khách (bảng xếp hạng không có GUEST). Quyền xem bảng xếp hạng do middleware `requireWorkspaceRole` kiểm — thư mục này không quyết định quyền.
 */
export interface IGamDirectory {
  getUsers(ids: readonly string[]): Promise<Map<string, GamUser>>;
  /** Múi giờ hợp lệ (rỗng/lạ/không tìm thấy → `Asia/Ho_Chi_Minh`) và trạng thái (`null` = không có người dùng). */
  getTimezoneAndStatus(userId: string): Promise<{ timezone: string; status: string } | null>;
  /** Thành viên ACTIVE (OWNER/ADMIN/MEMBER) của nhóm. */
  listMemberIds(workspaceId: string): Promise<string[]>;
  /** Nhóm ACTIVE mà người này là thành viên không phải khách (cho `myWorkspaces`/kiểm chung nhóm). */
  listWorkspaceIds(userId: string): Promise<string[]>;
  /** Tên nhóm theo id (chỉ id + tên — cho cột "Workspace" của lịch sử XP ở admin); id không tồn tại bị bỏ khỏi map. */
  getWorkspaceNames(ids: readonly string[]): Promise<Map<string, string>>;
  /** Vai trò hệ thống của người dùng (`null` = không tồn tại) — gate tải ảnh huy hiệu kiểm `gamification:update` theo vai trò. */
  getRole(userId: string): Promise<string | null>;
}

export class PrismaGamDirectory implements IGamDirectory {
  async getUsers(ids: readonly string[]): Promise<Map<string, GamUser>> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return new Map();
    const rows = await prisma.user.findMany({
      where: { id: { in: unique } },
      select: { id: true, name: true, status: true, timezone: true, avatarAssetId: true, privacy: { select: { showInLeaderboard: true, showGamification: true } } },
    });
    return new Map(
      rows.map((u) => [
        u.id,
        {
          id: u.id,
          name: u.name,
          status: u.status,
          timezone: safeTimeZone(u.timezone),
          avatarAssetId: u.avatarAssetId,
          showInLeaderboard: u.privacy?.showInLeaderboard !== false,
          showGamification: u.privacy?.showGamification !== false,
        },
      ])
    );
  }

  async getTimezoneAndStatus(userId: string): Promise<{ timezone: string; status: string } | null> {
    const row = await prisma.user.findUnique({ where: { id: userId }, select: { timezone: true, status: true } });
    return row ? { timezone: safeTimeZone(row.timezone), status: row.status } : null;
  }

  async listMemberIds(workspaceId: string): Promise<string[]> {
    const rows = await prisma.workspaceMembership.findMany({ where: { workspaceId, status: "ACTIVE", role: { in: ["OWNER", "ADMIN", "MEMBER"] } }, select: { userId: true } });
    return rows.map((r) => r.userId);
  }

  async listWorkspaceIds(userId: string): Promise<string[]> {
    const rows = await prisma.workspaceMembership.findMany({ where: { userId, status: "ACTIVE", role: { in: ["OWNER", "ADMIN", "MEMBER"] } }, select: { workspaceId: true } });
    return rows.map((r) => r.workspaceId);
  }

  async getWorkspaceNames(ids: readonly string[]): Promise<Map<string, string>> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return new Map();
    const rows = await prisma.workspace.findMany({ where: { id: { in: unique } }, select: { id: true, name: true } });
    return new Map(rows.map((w) => [w.id, w.name]));
  }

  async getRole(userId: string): Promise<string | null> {
    const row = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
    return row ? row.role : null;
  }
}
