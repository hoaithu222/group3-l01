import { prisma } from "../../../infrastructure/database";
import type { IChannelRepository } from "./channel.repository.interface";
import type {
  Channel,
  ChannelStatusValue,
  ChannelTypeValue,
  AdminListChannelsParams,
  AdminChannelRow,
} from "../entities/channel.interface";

type ChannelRecord = Awaited<ReturnType<typeof prisma.channel.findFirstOrThrow>>;

function mapChannel(record: ChannelRecord): Channel {
  return {
    id: record.id,
    workspaceId: record.workspaceId,
    name: record.name,
    normalizedName: record.normalizedName,
    description: record.description,
    type: record.type,
    visibility: record.visibility,
    postingPolicy: record.postingPolicy,
    status: record.status,
    archiveReason: record.archiveReason,
    archivedAt: record.archivedAt,
    archivedBy: record.archivedBy,
    isDefault: record.isDefault,
    position: record.position,
    lastSeq: record.lastSeq,
    lastMessageAt: record.lastMessageAt,
    lastMessageId: record.lastMessageId,
    memberCount: record.memberCount,
    createdBy: record.createdBy,
    voiceSettings: record.voiceSettings
      ? { allowVideo: record.voiceSettings.allowVideo, maxParticipants: record.voiceSettings.maxParticipants }
      : null,
    version: record.version,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export class PrismaChannelRepository implements IChannelRepository {
  async findById(id: string): Promise<Channel | null> {
    const record = await prisma.channel.findUnique({ where: { id } });
    return record ? mapChannel(record) : null;
  }

  async findByWorkspaceAndNormalizedName(
    workspaceId: string,
    normalizedName: string,
    status?: ChannelStatusValue
  ): Promise<Channel | null> {
    const record = await prisma.channel.findFirst({
      where: { workspaceId, normalizedName, ...(status && { status }) },
    });
    return record ? mapChannel(record) : null;
  }

  async countActive(workspaceId: string): Promise<number> {
    return prisma.channel.count({ where: { workspaceId, status: "ACTIVE" } });
  }

  async listByIds(ids: string[]): Promise<Channel[]> {
    if (ids.length === 0) return [];
    const records = await prisma.channel.findMany({ where: { id: { in: ids } } });
    return records.map(mapChannel);
  }

  async listByWorkspace(workspaceId: string, status: ChannelStatusValue, type?: ChannelTypeValue): Promise<Channel[]> {
    const records = await prisma.channel.findMany({
      where: { workspaceId, status, ...(type && { type }) },
    });
    return records.map(mapChannel);
  }

  async adminListPublic(
    workspaceId: string,
    params: AdminListChannelsParams
  ): Promise<{ data: AdminChannelRow[]; total: number }> {
    const where = {
      workspaceId,
      visibility: "PUBLIC" as const,
      ...(params.status && { status: params.status }),
      ...(params.type && { type: params.type }),
    };
    const [records, total] = await Promise.all([
      prisma.channel.findMany({
        where,
        orderBy: [{ position: "asc" }, { name: "asc" }],
        skip: (params.page - 1) * params.limit,
        take: params.limit,
      }),
      prisma.channel.count({ where }),
    ]);
    const messages7d = await countMessages7d(records.map((r) => r.id));
    const data: AdminChannelRow[] = records.map((r) => ({
      id: r.id,
      name: r.name,
      type: r.type,
      postingPolicy: r.postingPolicy,
      status: r.status,
      isDefault: r.isDefault,
      archiveReason: r.archiveReason,
      memberCount: r.memberCount,
      messages7d: messages7d.get(r.id) ?? 0,
      createdAt: r.createdAt,
    }));
    return { data, total };
  }

  async adminCountPrivate(workspaceId: string): Promise<{ total: number; archived: number }> {
    const [total, archived] = await Promise.all([
      prisma.channel.count({ where: { workspaceId, visibility: "PRIVATE" } }),
      prisma.channel.count({ where: { workspaceId, visibility: "PRIVATE", status: "ARCHIVED" } }),
    ]);
    return { total, archived };
  }
}

/**
 * Số tin (mọi loại, kể cả trả lời thread) gửi vào từng kênh trong 7 ngày gần nhất — MỘT truy vấn `groupBy`
 * cho cả trang (≤ 100 kênh), cùng cách đếm `messages7d` của `admin-conversations`.
 */
async function countMessages7d(channelIds: string[]): Promise<Map<string, number>> {
  if (channelIds.length === 0) return new Map();
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const rows = await prisma.message.groupBy({
    by: ["scopeId"],
    where: { scopeType: "CHANNEL", scopeId: { in: channelIds }, createdAt: { gte: since } },
    _count: { _all: true },
  });
  return new Map(rows.map((r) => [r.scopeId, r._count._all]));
}
