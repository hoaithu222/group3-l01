import { prisma } from "../../../infrastructure/database";
import type { ChannelUserSummary } from "../entities/channel.interface";
import {
  isGrantRoleRef,
  rolesCovering,
  workspaceRolesCoveredByAny,
  type GrantRoleRef,
} from "../../../core/constants/role-coverage";

/** Người đọc được nhờ role grant + `roleRef` đang phủ tới họ (ưu tiên `ADMIN` trước `MEMBER` khi cả hai đều phủ). */
export interface RoleCoveredUser {
  user: ChannelUserSummary;
  roleRef: GrantRoleRef;
}

/**
 * Cổng đọc "quyền qua vai trò" (p3-04) — tách khỏi `IChannelGrantRepository` để unit test grant DIRECT (Phase 1)
 * không phải mock membership; service nhận cổng này TUỲ CHỌN (không truyền → chỉ tính grant DIRECT).
 */
export interface IChannelRoleAudience {
  /**
   * Người ĐỌC ĐƯỢC kênh nhờ grant theo vai trò: thành viên ACTIVE của workspace có vai trò nằm trong tập phủ bởi
   * các `roleRef` mà kênh đã cấp (`ADMIN` = OWNER+ADMIN; `MEMBER` = OWNER+ADMIN+MEMBER; không bao giờ GUEST).
   * Kênh không có role grant → `[]` (không truy vấn membership).
   */
  listCoveredUserIds(channelId: string): Promise<string[]>;
  /** Như `listCoveredUserIds` nhưng kèm tên/ảnh và `roleRef` phủ tới (danh sách thành viên kênh). */
  listCoveredUsers(channelId: string): Promise<RoleCoveredUser[]>;
  /** `roleRef` phủ tới vai trò workspace HIỆN TẠI của user (membership ACTIVE); không phải thành viên/GUEST → `[]`. */
  coveringRolesOf(workspaceId: string, userId: string): Promise<readonly GrantRoleRef[]>;
}

type RoleDb = Pick<typeof prisma, "channelGrant" | "workspaceMembership">;

/** Các `roleRef` hợp lệ đang được cấp trên 1 kênh (bỏ dòng lạ). */
export async function loadChannelRoleRefs(channelId: string, db: RoleDb = prisma): Promise<GrantRoleRef[]> {
  const rows = await db.channelGrant.findMany({
    where: { channelId, source: "ROLE" },
    select: { roleRef: true },
  });
  return rows.flatMap((r) => (isGrantRoleRef(r.roleRef) ? [r.roleRef] : []));
}

/** Thành viên ACTIVE của workspace có vai trò được phủ bởi `roleRefs` — `roleRefs` rỗng → `[]`. */
export async function loadRoleCoveredMembers(
  workspaceId: string,
  roleRefs: readonly GrantRoleRef[],
  db: Pick<typeof prisma, "workspaceMembership"> = prisma
): Promise<Array<{ userId: string; role: string }>> {
  if (roleRefs.length === 0) return [];
  return db.workspaceMembership.findMany({
    where: { workspaceId, status: "ACTIVE", role: { in: workspaceRolesCoveredByAny(roleRefs) } },
    select: { userId: true, role: true },
  });
}

export class PrismaChannelRoleAudience implements IChannelRoleAudience {
  private async coveredMembers(channelId: string): Promise<{ members: Array<{ userId: string; role: string }>; roleRefs: GrantRoleRef[] }> {
    const grants = await prisma.channelGrant.findMany({
      where: { channelId, source: "ROLE" },
      select: { workspaceId: true, roleRef: true },
    });
    const roleRefs = grants.flatMap((g) => (isGrantRoleRef(g.roleRef) ? [g.roleRef] : []));
    if (roleRefs.length === 0) return { members: [], roleRefs };
    return { members: await loadRoleCoveredMembers(grants[0]!.workspaceId, roleRefs), roleRefs };
  }

  async listCoveredUserIds(channelId: string): Promise<string[]> {
    return (await this.coveredMembers(channelId)).members.map((m) => m.userId);
  }

  async listCoveredUsers(channelId: string): Promise<RoleCoveredUser[]> {
    const { members, roleRefs } = await this.coveredMembers(channelId);
    if (members.length === 0) return [];
    const users = await prisma.user.findMany({
      where: { id: { in: members.map((m) => m.userId) } },
      select: { id: true, name: true, normalizedName: true, avatarAssetId: true },
    });
    const byId = new Map(users.map((u) => [u.id, u]));
    const out: RoleCoveredUser[] = [];
    for (const m of members) {
      const user = byId.get(m.userId);
      const roleRef = rolesCovering(m.role).find((r) => roleRefs.includes(r));
      if (user && roleRef) out.push({ user, roleRef });
    }
    return out;
  }

  async coveringRolesOf(workspaceId: string, userId: string): Promise<readonly GrantRoleRef[]> {
    const membership = await prisma.workspaceMembership.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
      select: { role: true, status: true },
    });
    return membership && membership.status === "ACTIVE" ? rolesCovering(membership.role) : [];
  }
}
