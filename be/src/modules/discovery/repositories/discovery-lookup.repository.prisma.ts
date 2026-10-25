import { prisma } from "../../../infrastructure/database";
import type { ChannelInfo, ConversationInfo, DiscoveryUserBrief } from "../entities/discovery.interface";
import type { IDiscoveryLookupRepository } from "./discovery-lookup.repository.interface";

export class PrismaDiscoveryLookupRepository implements IDiscoveryLookupRepository {
  async describeChannels(channelIds: string[]): Promise<Map<string, ChannelInfo>> {
    if (channelIds.length === 0) return new Map();
    const rows = await prisma.channel.findMany({
      where: { id: { in: channelIds } },
      select: { id: true, name: true, visibility: true },
    });
    return new Map(rows.map((c) => [c.id, { name: c.name, isPrivate: c.visibility === "PRIVATE" }]));
  }

  async describeConversations(viewerId: string, conversationIds: string[]): Promise<Map<string, ConversationInfo>> {
    if (conversationIds.length === 0) return new Map();
    const [conversations, myMemberships] = await Promise.all([
      prisma.conversation.findMany({
        where: { id: { in: conversationIds } },
        select: { id: true, kind: true, title: true },
      }),
      prisma.conversationMember.findMany({
        where: { userId: viewerId, conversationId: { in: conversationIds } },
        select: { conversationId: true, peerUserId: true },
      }),
    ]);

    const peerByConversation = new Map(myMemberships.map((m) => [m.conversationId, m.peerUserId]));
    const peerIds = Array.from(new Set(myMemberships.flatMap((m) => (m.peerUserId ? [m.peerUserId] : []))));
    const peers = await this.userBriefs(peerIds);

    return new Map(
      conversations.map((c) => {
        const peerId = c.kind === "DIRECT" ? peerByConversation.get(c.id) ?? null : null;
        const info: ConversationInfo = {
          kind: c.kind,
          title: c.title,
          peerName: peerId ? peers.get(peerId)?.name ?? null : null,
        };
        return [c.id, info];
      })
    );
  }

  async userBriefs(userIds: string[]): Promise<Map<string, DiscoveryUserBrief>> {
    const unique = Array.from(new Set(userIds));
    if (unique.length === 0) return new Map();
    const users = await prisma.user.findMany({ where: { id: { in: unique } }, select: { id: true, name: true, avatarAssetId: true } });
    return new Map(users.map((u) => [u.id, { name: u.name, avatarAssetId: u.avatarAssetId }]));
  }
}
