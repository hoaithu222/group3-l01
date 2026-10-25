import { prisma } from "../../../infrastructure/database";
import type {
  IInboxContextRepository,
  InboxActorRef,
  InboxContextMessage,
  InboxScopeInfo,
} from "./inbox-context.repository.interface";

export class PrismaInboxContextRepository implements IInboxContextRepository {
  async findMessages(ids: string[]): Promise<Map<string, InboxContextMessage>> {
    const out = new Map<string, InboxContextMessage>();
    if (ids.length === 0) return out;
    const rows = await prisma.message.findMany({ where: { id: { in: ids } } });
    for (const m of rows) {
      out.set(m.id, {
        id: m.id,
        seq: m.seq,
        scopeType: m.scopeType,
        scopeId: m.scopeId,
        threadId: m.threadId,
        content: m.content,
        mentions: m.mentions.map((x) => ({ type: x.type, targetId: x.targetId, label: x.label })),
        attachments: m.attachments.map((a) => ({ kind: a.kind, name: a.name })),
        deletedAt: m.deletedAt,
      });
    }
    return out;
  }

  async loadScopeInfo(
    viewerId: string,
    channelIds: string[],
    conversationIds: string[]
  ): Promise<Map<string, InboxScopeInfo>> {
    const out = new Map<string, InboxScopeInfo>();

    if (channelIds.length > 0) {
      const channels = await prisma.channel.findMany({ where: { id: { in: channelIds } }, select: { id: true, name: true } });
      for (const c of channels) out.set(`CHANNEL:${c.id}`, { name: c.name, hiddenBeforeSeq: 0 });
    }

    if (conversationIds.length > 0) {
      const [convs, members] = await Promise.all([
        prisma.conversation.findMany({
          where: { id: { in: conversationIds } },
          select: { id: true, kind: true, title: true },
        }),
        prisma.conversationMember.findMany({
          where: { conversationId: { in: conversationIds }, userId: viewerId },
          select: { conversationId: true, peerUserId: true, hiddenBeforeSeq: true },
        }),
      ]);
      const memberByConv = new Map(members.map((m) => [m.conversationId, m]));
      const peerIds = members.map((m) => m.peerUserId).filter((id): id is string => !!id);
      const peers = peerIds.length
        ? await prisma.user.findMany({ where: { id: { in: peerIds } }, select: { id: true, name: true } })
        : [];
      const peerName = new Map(peers.map((p) => [p.id, p.name]));

      for (const c of convs) {
        const member = memberByConv.get(c.id);
        const name = c.kind === "GROUP" ? (c.title ?? undefined) : member?.peerUserId ? peerName.get(member.peerUserId) : undefined;
        out.set(`CONVERSATION:${c.id}`, { name, hiddenBeforeSeq: member?.hiddenBeforeSeq ?? 0 });
      }
    }
    return out;
  }

  async loadActors(userIds: string[]): Promise<Map<string, InboxActorRef>> {
    if (userIds.length === 0) return new Map();
    const rows = await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, avatarAssetId: true } });
    return new Map(rows.map((u) => [u.id, { name: u.name, avatarAssetId: u.avatarAssetId }]));
  }
}
