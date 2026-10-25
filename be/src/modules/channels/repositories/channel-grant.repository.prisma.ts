import { prisma } from "../../../infrastructure/database";
import type { IChannelGrantRepository } from "./channel-grant.repository.interface";
import type { ChannelGrant, ChannelGrantWithUser, ChannelUserSummary } from "../entities/channel.interface";

type GrantRecord = Awaited<ReturnType<typeof prisma.channelGrant.findFirstOrThrow>>;

function mapGrant(record: GrantRecord): ChannelGrant {
  return {
    id: record.id,
    channelId: record.channelId,
    workspaceId: record.workspaceId,
    userId: record.userId,
    subjectKey: record.subjectKey,
    level: record.level,
    source: record.source,
    roleRef: record.roleRef,
    grantedBy: record.grantedBy,
    createdAt: record.createdAt,
  };
}

/** Điều kiện "grant hiệu lực cho user": DIRECT của chính họ ∪ ROLE phủ tới vai trò của họ. */
function effectiveFor(userId: string, coveringRoles: readonly string[]) {
  return coveringRoles.length > 0
    ? { OR: [{ userId, source: "DIRECT" as const }, { source: "ROLE" as const, roleRef: { in: [...coveringRoles] } }] }
    : { userId, source: "DIRECT" as const };
}

export class PrismaChannelGrantRepository implements IChannelGrantRepository {
  async forUser(channelId: string, userId: string, coveringRoles: readonly string[] = []): Promise<ChannelGrant[]> {
    const records = await prisma.channelGrant.findMany({ where: { channelId, ...effectiveFor(userId, coveringRoles) } });
    return records.map(mapGrant);
  }

  async findDirect(channelId: string, userId: string): Promise<ChannelGrant | null> {
    const record = await prisma.channelGrant.findUnique({
      where: { channelId_subjectKey_source: { channelId, subjectKey: userId, source: "DIRECT" } },
    });
    return record ? mapGrant(record) : null;
  }

  async listChannelIdsForUser(workspaceId: string, userId: string, coveringRoles: readonly string[] = []): Promise<string[]> {
    const records = await prisma.channelGrant.findMany({
      where: { workspaceId, ...effectiveFor(userId, coveringRoles) },
      select: { channelId: true },
    });
    return Array.from(new Set(records.map((r) => r.channelId)));
  }

  async countManagers(channelId: string): Promise<number> {
    return prisma.channelGrant.count({ where: { channelId, level: "MANAGER" } });
  }

  async listByChannel(channelId: string): Promise<ChannelGrantWithUser[]> {
    const records = await prisma.channelGrant.findMany({ where: { channelId, source: "DIRECT" } });
    const grants = records.map(mapGrant);
    if (grants.length === 0) return [];

    const userIds = Array.from(new Set(grants.flatMap((g) => (g.userId ? [g.userId] : []))));
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true, normalizedName: true, avatarAssetId: true },
    });
    const byId = new Map<string, ChannelUserSummary>(users.map((u) => [u.id, u]));

    const result: ChannelGrantWithUser[] = [];
    for (const grant of grants) {
      const user = grant.userId ? byId.get(grant.userId) : undefined;
      if (!user) continue;
      result.push({ grant, user });
    }
    return result;
  }

  async listRoleGrants(channelId: string): Promise<ChannelGrant[]> {
    const records = await prisma.channelGrant.findMany({ where: { channelId, source: "ROLE" } });
    return records.map(mapGrant);
  }
}
