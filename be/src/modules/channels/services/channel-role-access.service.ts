import type { Prisma } from "@prisma/client";
import {
  isGrantRoleRef,
  roleSubjectKey,
  rolesCovering,
  type GrantRoleRef,
} from "../../../core/constants/role-coverage";
import { loadRoleCoveredMembers } from "./channel-role-audience";

type Db = Prisma.TransactionClient;

export interface ChannelRef {
  id: string;
  workspaceId: string;
}

interface ReaderInputs {
  /** Người có grant DIRECT (mọi bậc). */
  direct: Set<string>;
  /** Các `roleRef` đang được cấp trên kênh. */
  roleRefs: GrantRoleRef[];
}

/** Kết quả đồng bộ 1 người trên mọi kênh có role grant của workspace (đổi vai trò / mới vào nhóm). */
export interface UserRoleSyncResult {
  /** Kênh riêng tư vừa có quyền đọc nhờ vai trò mới (đã tạo `ChannelMembership`). */
  granted: string[];
  /** Kênh riêng tư vừa mất quyền đọc (không còn DIRECT lẫn role grant phủ tới) — đã xoá `ChannelMembership`. */
  revoked: string[];
}

async function loadReaderInputs(db: Db, channelId: string): Promise<ReaderInputs> {
  const rows = await db.channelGrant.findMany({ where: { channelId }, select: { userId: true, source: true, roleRef: true } });
  const direct = new Set<string>();
  const roleRefs: GrantRoleRef[] = [];
  for (const row of rows) {
    if (row.source === "ROLE") {
      if (isGrantRoleRef(row.roleRef)) roleRefs.push(row.roleRef);
    } else if (row.userId) {
      direct.add(row.userId);
    }
  }
  return { direct, roleRefs };
}

/** Người đọc được kênh = DIRECT ∪ thành viên ACTIVE có vai trò được phủ bởi `roleRefs`. */
async function computeReaders(
  db: Db,
  workspaceId: string,
  direct: ReadonlySet<string>,
  roleRefs: readonly GrantRoleRef[]
): Promise<Set<string>> {
  const covered = await loadRoleCoveredMembers(workspaceId, roleRefs, db);
  return new Set<string>([...direct, ...covered.map((m) => m.userId)]);
}

async function recountMembers(db: Db, channelId: string): Promise<void> {
  const memberCount = await db.channelMembership.count({ where: { channelId } });
  await db.channel.update({ where: { id: channelId }, data: { memberCount } });
}

/**
 * Đồng bộ QUYỀN ĐỌC KÊNH RIÊNG TƯ theo vai trò (p3-04 §5.2). Nguồn sự thật quyền đọc là GRANT (resolver tính động
 * `DIRECT ∪ ROLE phủ tới`); `ChannelMembership` được "hiện thực hoá" cho mọi người đọc được (kể cả qua vai trò) để danh
 * sách kênh (`joined`), số chưa đọc và cài đặt thông báo của họ hoạt động như grant DIRECT. Mọi hàm ở đây chạy TRONG
 * transaction của caller và KHÔNG phát sự kiện — caller phát realtime/thông báo SAU commit.
 */
export class ChannelRoleAccessService {
  /** Thêm role grant (idempotent). `gained` = người vừa có quyền đọc (trước chưa đọc được). */
  async addRoleGrant(
    tx: Db,
    channel: ChannelRef,
    roleRef: GrantRoleRef,
    actorId: string
  ): Promise<{ created: boolean; gained: string[] }> {
    const inputs = await loadReaderInputs(tx, channel.id);
    if (inputs.roleRefs.includes(roleRef)) return { created: false, gained: [] };

    const before = await computeReaders(tx, channel.workspaceId, inputs.direct, inputs.roleRefs);
    await tx.channelGrant.create({
      data: {
        channelId: channel.id,
        workspaceId: channel.workspaceId,
        userId: null, // Ghi null tường minh (Prisma+Mongo không khớp `{userId:null}` với field vắng)
        subjectKey: roleSubjectKey(roleRef),
        level: "MEMBER", // Role grant chỉ MEMBER — MANAGER phải đích danh (README §2)
        source: "ROLE",
        roleRef,
        grantedBy: actorId,
      },
    });
    const after = await computeReaders(tx, channel.workspaceId, inputs.direct, [...inputs.roleRefs, roleRef]);

    await this.ensureMemberships(tx, channel, [...after]);
    await recountMembers(tx, channel.id);
    return { created: true, gained: [...after].filter((id) => !before.has(id)) };
  }

  /** Gỡ role grant (idempotent). `lost` = người mất quyền đọc (không còn DIRECT lẫn role grant khác phủ tới). */
  async removeRoleGrant(tx: Db, channel: ChannelRef, roleRef: GrantRoleRef): Promise<{ removed: boolean; lost: string[] }> {
    const inputs = await loadReaderInputs(tx, channel.id);
    if (!inputs.roleRefs.includes(roleRef)) return { removed: false, lost: [] };

    const before = await computeReaders(tx, channel.workspaceId, inputs.direct, inputs.roleRefs);
    const remainingRefs = inputs.roleRefs.filter((r) => r !== roleRef);
    const after = await computeReaders(tx, channel.workspaceId, inputs.direct, remainingRefs);

    await tx.channelGrant.deleteMany({ where: { channelId: channel.id, source: "ROLE", roleRef } });
    const lost = [...before].filter((id) => !after.has(id));
    if (lost.length > 0) {
      await tx.channelMembership.deleteMany({ where: { channelId: channel.id, userId: { in: lost } } });
    }
    await recountMembers(tx, channel.id);
    return { removed: true, lost };
  }

  /**
   * Tính lại quyền của MỘT người trên mọi kênh có role grant trong workspace theo vai trò HIỆN TẠI của họ (RB-09) —
   * idempotent, tính từ trạng thái DB. Gọi khi đổi vai trò và khi người đó vào nhóm.
   */
  async reconcileUser(tx: Db, workspaceId: string, userId: string): Promise<UserRoleSyncResult> {
    const result: UserRoleSyncResult = { granted: [], revoked: [] };
    const roleGrants = await tx.channelGrant.findMany({
      where: { workspaceId, source: "ROLE" },
      select: { channelId: true, roleRef: true },
    });
    if (roleGrants.length === 0) return result;

    const refsByChannel = new Map<string, GrantRoleRef[]>();
    for (const g of roleGrants) {
      if (!isGrantRoleRef(g.roleRef)) continue;
      refsByChannel.set(g.channelId, [...(refsByChannel.get(g.channelId) ?? []), g.roleRef]);
    }
    const channelIds = [...refsByChannel.keys()];

    const membership = await tx.workspaceMembership.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
      select: { role: true, status: true },
    });
    const covering: readonly GrantRoleRef[] = membership?.status === "ACTIVE" ? rolesCovering(membership.role) : [];

    const [directRows, memberRows] = await Promise.all([
      tx.channelGrant.findMany({ where: { channelId: { in: channelIds }, userId, source: "DIRECT" }, select: { channelId: true } }),
      tx.channelMembership.findMany({ where: { channelId: { in: channelIds }, userId }, select: { channelId: true } }),
    ]);
    const direct = new Set(directRows.map((r) => r.channelId));
    const joined = new Set(memberRows.map((r) => r.channelId));

    for (const channelId of channelIds) {
      const viaRole = (refsByChannel.get(channelId) ?? []).some((ref) => covering.includes(ref));
      const desired = viaRole || direct.has(channelId);
      const has = joined.has(channelId);
      if (desired && !has) {
        await tx.channelMembership.create({ data: { channelId, workspaceId, userId } });
        await tx.channel.update({ where: { id: channelId }, data: { memberCount: { increment: 1 } } });
        result.granted.push(channelId);
      } else if (!desired && has) {
        await tx.channelMembership.deleteMany({ where: { channelId, userId } });
        await tx.channel.update({ where: { id: channelId }, data: { memberCount: { decrement: 1 } } });
        result.revoked.push(channelId);
      }
    }
    return result;
  }

  private async ensureMemberships(tx: Db, channel: ChannelRef, userIds: string[]): Promise<void> {
    if (userIds.length === 0) return;
    const existing = await tx.channelMembership.findMany({
      where: { channelId: channel.id, userId: { in: userIds } },
      select: { userId: true },
    });
    const have = new Set(existing.map((m) => m.userId));
    const missing = userIds.filter((id) => !have.has(id));
    if (missing.length > 0) {
      await tx.channelMembership.createMany({
        data: missing.map((userId) => ({ channelId: channel.id, workspaceId: channel.workspaceId, userId })),
      });
    }
  }
}
