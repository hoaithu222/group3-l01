import { prisma } from "../../../infrastructure/database";
import { normalizeSearch } from "../../../core/utils/normalize";
import type { IChannelMembershipRepository } from "./channel-membership.repository.interface";
import type {
  ChannelMembership,
  ChannelMembershipWithUser,
  ChannelUserSummary,
  ListChannelMembersParams,
} from "../entities/channel.interface";

type MembershipRecord = Awaited<ReturnType<typeof prisma.channelMembership.findFirstOrThrow>>;

function mapMembership(record: MembershipRecord): ChannelMembership {
  return {
    id: record.id,
    channelId: record.channelId,
    workspaceId: record.workspaceId,
    userId: record.userId,
    notifyMode: record.notifyMode,
    pinned: record.pinned,
    position: record.position,
    joinedAt: record.joinedAt,
    updatedAt: record.updatedAt,
  };
}

export class PrismaChannelMembershipRepository implements IChannelMembershipRepository {
  async find(channelId: string, userId: string): Promise<ChannelMembership | null> {
    const record = await prisma.channelMembership.findUnique({ where: { channelId_userId: { channelId, userId } } });
    return record ? mapMembership(record) : null;
  }

  async listByUser(workspaceId: string, userId: string): Promise<ChannelMembership[]> {
    const records = await prisma.channelMembership.findMany({ where: { workspaceId, userId } });
    return records.map(mapMembership);
  }

  async listByChannel(
    channelId: string,
    params: ListChannelMembersParams
  ): Promise<{ data: ChannelMembershipWithUser[]; total: number }> {
    const records = await prisma.channelMembership.findMany({ where: { channelId } });
    const memberships = records.map(mapMembership);
    if (memberships.length === 0) return { data: [], total: 0 };

    const userIds = Array.from(new Set(memberships.map((m) => m.userId)));
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true, normalizedName: true, avatarAssetId: true },
    });
    const byId = new Map<string, ChannelUserSummary>(users.map((u) => [u.id, u]));

    let joined: ChannelMembershipWithUser[] = [];
    for (const membership of memberships) {
      const user = byId.get(membership.userId);
      if (!user) continue;
      joined.push({ membership, user });
    }

    if (params.q) {
      const needle = normalizeSearch(params.q);
      joined = joined.filter((row) => row.user.normalizedName.includes(needle));
    }
    joined.sort((a, b) => a.user.normalizedName.localeCompare(b.user.normalizedName));

    const start = (params.page - 1) * params.limit;
    return { data: joined.slice(start, start + params.limit), total: joined.length };
  }
}
