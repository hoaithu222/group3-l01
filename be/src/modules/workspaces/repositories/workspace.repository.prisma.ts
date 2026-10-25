import { prisma } from "../../../infrastructure/database";
import { env } from "../../../core/config";
import { dayKeyInTz } from "../services/workspace-stats.util";
import type { IWorkspaceRepository, WorkspaceStatDay } from "./workspace.repository.interface";
import type {
  Workspace,
  WorkspaceMembership,
  AdminListWorkspacesParams,
  AdminWorkspaceRecord,
  MembershipStatusValue,
  WorkspaceMeUpdateInput,
} from "../entities/workspace.interface";

type WorkspaceRecord = Awaited<ReturnType<typeof prisma.workspace.findFirstOrThrow>>;
type MembershipRecord = Awaited<ReturnType<typeof prisma.workspaceMembership.findFirstOrThrow>>;

function mapWorkspace(record: WorkspaceRecord): Workspace {
  return {
    id: record.id,
    name: record.name,
    normalizedName: record.normalizedName,
    description: record.description,
    avatarAssetId: record.avatarAssetId,
    ownerId: record.ownerId,
    defaultChannelId: record.defaultChannelId,
    status: record.status,
    archivedAt: record.archivedAt,
    archivedBy: record.archivedBy,
    archivedReason: record.archivedReason,
    archiveNote: record.archiveNote,
    memberCount: record.memberCount,
    lastActivityAt: record.lastActivityAt,
    version: record.version,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    joinPolicy: record.joinPolicy === "APPROVAL" ? "APPROVAL" : "OPEN",
    guestPolicy: record.guestPolicy,
    // ⚠️ Trước đây KHÔNG map `timezone` ⇒ `GET /workspaces/:id` luôn trả `timezone: null` dù OWNER đã đặt (chỉ PATCH trả đúng
    // vì dùng hàng Prisma thô). Map đủ để GET/overview khớp PATCH.
    timezone: record.timezone ?? null,
    coverAssetId: record.coverAssetId ?? null,
    coverPreset: record.coverPreset ?? null,
  };
}

function mapMembership(record: MembershipRecord): WorkspaceMembership {
  return {
    id: record.id,
    workspaceId: record.workspaceId,
    userId: record.userId,
    role: record.role,
    status: record.status,
    displayName: record.displayName,
    joinedAt: record.joinedAt,
    leftAt: record.leftAt,
    expiresAt: record.expiresAt,
    invitedBy: record.invitedBy,
    inviteLinkId: record.inviteLinkId,
    banReason: record.banReason,
    removedBy: record.removedBy,
    isFavorite: record.isFavorite,
    position: record.position,
    notifyMode: record.notifyMode,
    lastVisitedAt: record.lastVisitedAt,
    requestedAt: record.requestedAt,
  };
}

export class PrismaWorkspaceRepository implements IWorkspaceRepository {
  async findById(id: string): Promise<Workspace | null> {
    const record = await prisma.workspace.findUnique({ where: { id } });
    return record ? mapWorkspace(record) : null;
  }

  async findMembership(workspaceId: string, userId: string): Promise<WorkspaceMembership | null> {
    const record = await prisma.workspaceMembership.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
    });
    return record ? mapMembership(record) : null;
  }

  async findMembershipWithWorkspace(
    userId: string,
    workspaceId: string
  ): Promise<{ workspace: Workspace; membership: WorkspaceMembership } | null> {
    const [workspace, membership] = await Promise.all([
      prisma.workspace.findUnique({ where: { id: workspaceId } }),
      prisma.workspaceMembership.findUnique({ where: { workspaceId_userId: { workspaceId, userId } } }),
    ]);
    if (!workspace || !membership) return null;
    return { workspace: mapWorkspace(workspace), membership: mapMembership(membership) };
  }

  async countActiveMembershipsForUser(userId: string): Promise<number> {
    return prisma.workspaceMembership.count({ where: { userId, status: "ACTIVE" } });
  }

  async countMembers(workspaceId: string, status: MembershipStatusValue = "ACTIVE"): Promise<number> {
    return prisma.workspaceMembership.count({ where: { workspaceId, status } });
  }

  async updateMembershipSettings(
    workspaceId: string,
    userId: string,
    input: WorkspaceMeUpdateInput
  ): Promise<WorkspaceMembership> {
    const record = await prisma.workspaceMembership.update({
      where: { workspaceId_userId: { workspaceId, userId } },
      data: {
        ...(input.isFavorite !== undefined && { isFavorite: input.isFavorite }),
        ...(input.position !== undefined && { position: input.position }),
        ...(input.notifyMode !== undefined && { notifyMode: input.notifyMode }),
      },
    });
    return mapMembership(record);
  }

  async listForUser(
    userId: string,
    status: "ACTIVE" | "ARCHIVED" | "ALL"
  ): Promise<Array<{ workspace: Workspace; membership: WorkspaceMembership }>> {
    const memberships = await prisma.workspaceMembership.findMany({
      where: { userId, status: "ACTIVE" },
      orderBy: [{ isFavorite: "desc" }, { position: "asc" }, { joinedAt: "desc" }],
    });
    if (memberships.length === 0) return [];

    const workspaces = await prisma.workspace.findMany({
      where: {
        id: { in: memberships.map((m) => m.workspaceId) },
        ...(status !== "ALL" && { status }),
      },
    });
    const byId = new Map(workspaces.map((w) => [w.id, w]));

    const result: Array<{ workspace: Workspace; membership: WorkspaceMembership }> = [];
    for (const membership of memberships) {
      const workspace = byId.get(membership.workspaceId);
      if (!workspace) continue;
      result.push({ workspace: mapWorkspace(workspace), membership: mapMembership(membership) });
    }
    return result;
  }

  async listPendingForUser(
    userId: string,
    status: "ACTIVE" | "ARCHIVED" | "ALL"
  ): Promise<Array<{ workspace: Workspace; membership: WorkspaceMembership }>> {
    const memberships = await prisma.workspaceMembership.findMany({
      where: { userId, status: "PENDING" },
      orderBy: { requestedAt: "desc" },
    });
    if (memberships.length === 0) return [];
    const workspaces = await prisma.workspace.findMany({
      where: { id: { in: memberships.map((m) => m.workspaceId) }, ...(status !== "ALL" && { status }) },
    });
    const byId = new Map(workspaces.map((w) => [w.id, w]));
    const result: Array<{ workspace: Workspace; membership: WorkspaceMembership }> = [];
    for (const membership of memberships) {
      const workspace = byId.get(membership.workspaceId);
      if (workspace) result.push({ workspace: mapWorkspace(workspace), membership: mapMembership(membership) });
    }
    return result;
  }

  async adminList(params: AdminListWorkspacesParams): Promise<{ data: AdminWorkspaceRecord[]; total: number }> {
    const { page, limit, q, status, ownerId, createdFrom, createdTo, sort } = params;

    const where = {
      ...(q && { normalizedName: { contains: q.toLowerCase() } }),
      ...(status && { status }),
      ...(ownerId && { ownerId }),
      ...((createdFrom || createdTo) && {
        createdAt: { ...(createdFrom && { gte: createdFrom }), ...(createdTo && { lte: createdTo }) },
      }),
    };

    const [records, total] = await Promise.all([
      prisma.workspace.findMany({
        where,
        orderBy: { [sort]: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.workspace.count({ where }),
    ]);

    const ownerIds = Array.from(new Set(records.map((r) => r.ownerId)));
    const owners = ownerIds.length > 0
      ? await prisma.user.findMany({ where: { id: { in: ownerIds } }, select: { id: true, name: true } })
      : [];
    const ownerById = new Map(owners.map((o) => [o.id, o]));

    const data: AdminWorkspaceRecord[] = records.map((record) => ({
      id: record.id,
      name: record.name,
      avatarAssetId: record.avatarAssetId,
      coverAssetId: record.coverAssetId ?? null,
      coverPreset: record.coverPreset ?? null,
      owner: ownerById.get(record.ownerId) ?? null,
      memberCount: record.memberCount,
      status: record.status,
      createdAt: record.createdAt,
      lastActivityAt: record.lastActivityAt,
    }));

    return { data, total };
  }

  async adminGetDetail(
    id: string
  ): Promise<{ workspace: Workspace; owner: { id: string; name: string } | null } | null> {
    const record = await prisma.workspace.findUnique({ where: { id } });
    if (!record) return null;
    const owner = await prisma.user.findUnique({ where: { id: record.ownerId }, select: { id: true, name: true } });
    return { workspace: mapWorkspace(record), owner };
  }

  async getDailyStats(workspaceId: string, from: Date, to: Date): Promise<WorkspaceStatDay[]> {
    // Key ngày của `WorkspaceDailyStat` tính theo `env.CRON_TZ` (job `workspace.stats-daily`),
    // nên khoảng đọc cũng đổi sang cùng múi giờ — không dùng key UTC (lệch 1 ngày quanh nửa đêm).
    const fromKey = dayKeyInTz(from, env.CRON_TZ);
    const toKey = dayKeyInTz(to, env.CRON_TZ);
    const records = await prisma.workspaceDailyStat.findMany({
      where: { workspaceId, date: { gte: fromKey, lte: toKey } },
      orderBy: { date: "asc" },
    });
    return records.map((r) => ({ date: r.date, messages: r.messages, activeMembers: r.activeMembers, files: r.files }));
  }
}
