import { prisma } from "../../../infrastructure/database";
import type {
  ActiveWorkspaceRow,
  ConversationUnreadRow,
  InboxCounts,
  JoinedChannelRow,
  SubscribedThreadRow,
} from "../entities/read-state.interface";
import type { IUnreadRepository } from "./unread.repository.interface";

const CONVERSATION_ROWS_CAP = 2000;

export class PrismaUnreadRepository implements IUnreadRepository {
  async conversationRows(userId: string): Promise<ConversationUnreadRow[]> {
    const rows = await prisma.conversationMember.findMany({
      where: {
        userId,
        status: "ACTIVE",
        archivedAt: null,
        OR: [{ unreadCount: { gt: 0 } }, { markedUnread: true }, { mentionsSinceRead: { gt: 0 } }],
      },
      select: { unreadCount: true, markedUnread: true, mentionsSinceRead: true, notifyMode: true, mutedUntil: true },
      take: CONVERSATION_ROWS_CAP,
    });
    return rows;
  }

  async activeWorkspaceIds(userId: string, limit: number): Promise<ActiveWorkspaceRow[]> {
    const rows = await prisma.workspaceMembership.findMany({
      where: { userId, status: "ACTIVE" },
      select: { workspaceId: true, notifyMode: true },
      take: limit,
    });
    return rows.map((r) => ({ workspaceId: r.workspaceId, notifyMode: r.notifyMode }));
  }

  async joinedChannels(userId: string, workspaceIds: string[]): Promise<JoinedChannelRow[]> {
    if (workspaceIds.length === 0) return [];
    const memberships = await prisma.channelMembership.findMany({
      where: { userId, workspaceId: { in: workspaceIds } },
      select: { channelId: true, notifyMode: true },
    });
    if (memberships.length === 0) return [];
    const channels = await prisma.channel.findMany({
      where: { id: { in: memberships.map((m) => m.channelId) }, status: "ACTIVE" },
      select: { id: true, workspaceId: true, lastSeq: true },
    });
    const modeByChannel = new Map(memberships.map((m) => [m.channelId, m.notifyMode as string]));
    return channels.map((c) => ({
      channelId: c.id,
      workspaceId: c.workspaceId,
      lastSeq: c.lastSeq,
      notifyMode: modeByChannel.get(c.id) ?? "INHERIT",
    }));
  }

  async readSeqs(
    userId: string,
    streamType: "CHANNEL" | "THREAD",
    streamIds: string[]
  ): Promise<Map<string, number>> {
    if (streamIds.length === 0) return new Map();
    const rows = await prisma.readState.findMany({
      where: { userId, streamType, streamId: { in: streamIds } },
      select: { streamId: true, lastReadSeq: true },
    });
    return new Map(rows.map((r) => [r.streamId, r.lastReadSeq]));
  }

  async inboxCounts(userId: string): Promise<InboxCounts> {
    const base = { recipientId: userId, inInbox: true, readAt: null };
    const [unread, mentions, byWorkspace] = await Promise.all([
      prisma.notificationRecipient.count({ where: base }),
      prisma.notificationRecipient.count({ where: { ...base, filterBucket: "mentions" } }),
      prisma.notificationRecipient.groupBy({
        by: ["workspaceId"],
        where: { ...base, filterBucket: "mentions", workspaceId: { not: null } },
        _count: { _all: true },
        orderBy: { workspaceId: "asc" },
      }),
    ]);
    const mentionsByWorkspace = new Map<string, number>();
    for (const row of byWorkspace) {
      if (row.workspaceId) mentionsByWorkspace.set(row.workspaceId, row._count._all);
    }
    return { unread, mentions, mentionsByWorkspace };
  }

  async countChannelUnread(userId: string, channelId: string, afterSeq: number, cap: number): Promise<number> {
    const rows = await prisma.message.findMany({
      where: {
        scopeType: "CHANNEL",
        scopeId: channelId,
        threadKey: "root",
        seq: { gt: afterSeq },
        deletedAt: null,
        authorId: { not: userId },
      },
      select: { id: true },
      take: cap,
    });
    return rows.length;
  }

  async channelMentionCounts(userId: string, workspaceId: string): Promise<Map<string, number>> {
    const rows = await prisma.notificationRecipient.groupBy({
      by: ["scopeId"],
      where: {
        recipientId: userId,
        inInbox: true,
        readAt: null,
        filterBucket: "mentions",
        workspaceId,
        scopeType: "CHANNEL",
      },
      _count: { _all: true },
      orderBy: { scopeId: "asc" },
    });
    const out = new Map<string, number>();
    for (const row of rows) if (row.scopeId) out.set(row.scopeId, row._count._all);
    return out;
  }

  async subscribedThreads(userId: string, workspaceId: string): Promise<SubscribedThreadRow[]> {
    const channels = await prisma.channel.findMany({ where: { workspaceId }, select: { id: true } });
    if (channels.length === 0) return [];
    const subs = await prisma.threadSubscription.findMany({
      where: {
        userId,
        state: { in: ["AUTO_ON", "EXPLICIT_ON"] },
        channelId: { in: channels.map((c) => c.id) },
      },
      select: { threadId: true },
      take: 500,
    });
    if (subs.length === 0) return [];
    const threads = await prisma.thread.findMany({
      where: { id: { in: subs.map((s) => s.threadId) } },
      select: { id: true, channelId: true, lastReplySeq: true },
    });
    return threads.map((t) => ({ threadId: t.id, channelId: t.channelId, lastReplySeq: t.lastReplySeq }));
  }
}
