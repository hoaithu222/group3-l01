import { Prisma } from "@prisma/client";
import { prisma } from "../../../infrastructure/database";
import type { AdvanceReadStateInput, ConversationAdvance, ThreadInfo } from "../entities/read-state.interface";
import type { IReadStateRepository } from "./read-state.repository.interface";

export class PrismaReadStateRepository implements IReadStateRepository {
  async findConversationLastSeq(conversationId: string): Promise<number | null> {
    const row = await prisma.conversation.findUnique({ where: { id: conversationId }, select: { lastSeq: true } });
    return row ? row.lastSeq : null;
  }

  async findChannelInfo(channelId: string): Promise<{ workspaceId: string; lastSeq: number } | null> {
    const row = await prisma.channel.findUnique({
      where: { id: channelId },
      select: { workspaceId: true, lastSeq: true },
    });
    return row ?? null;
  }

  async findThreadInfo(threadIdOrRootMessageId: string): Promise<ThreadInfo | null> {
    const row = await prisma.thread.findFirst({
      where: { OR: [{ id: threadIdOrRootMessageId }, { parentMessageId: threadIdOrRootMessageId }] },
      select: { id: true, parentMessageId: true, workspaceId: true, channelId: true, lastReplySeq: true },
    });
    return row ?? null;
  }

  async advanceReadState(input: AdvanceReadStateInput): Promise<{ changed: boolean; lastReadSeq: number }> {
    const { userId, streamType, streamId, workspaceId, channelId, seq, now } = input;
    const key = { userId_streamType_streamId: { userId, streamType, streamId } };
    const existing = await prisma.readState.findUnique({ where: key });

    if (!existing) {
      if (seq <= 0) return { changed: false, lastReadSeq: 0 };
      try {
        await prisma.readState.create({
          data: { userId, streamType, streamId, workspaceId, channelId, lastReadSeq: seq, lastReadAt: now },
        });
        return { changed: true, lastReadSeq: seq };
      } catch (err) {
        // Song song 2 thiết bị cùng tạo lần đầu — bản còn lại rơi xuống nhánh cập nhật có điều kiện bên dưới.
        if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")) throw err;
      }
    }

    const res = await prisma.readState.updateMany({
      where: { userId, streamType, streamId, lastReadSeq: { lt: seq } },
      data: { lastReadSeq: seq, lastReadAt: now },
    });
    if (res.count > 0) return { changed: true, lastReadSeq: seq };
    const current = await prisma.readState.findUnique({ where: key, select: { lastReadSeq: true } });
    return { changed: false, lastReadSeq: current?.lastReadSeq ?? 0 };
  }

  async advanceConversationMember(input: {
    conversationId: string;
    userId: string;
    seq: number;
    now: Date;
  }): Promise<ConversationAdvance | null> {
    const { conversationId, userId, seq, now } = input;
    const key = { conversationId_userId: { conversationId, userId } };
    const member = await prisma.conversationMember.findUnique({ where: key });
    if (!member || member.status !== "ACTIVE") return null;

    if (member.lastReadSeq >= seq) {
      // Mốc không tiến (NT-03) — chỉ gỡ cờ "đánh dấu chưa đọc" khi người dùng mở lại hội thoại.
      let changed = false;
      if (member.markedUnread) {
        const r = await prisma.conversationMember.updateMany({
          where: { id: member.id, markedUnread: true },
          data: { markedUnread: false },
        });
        changed = r.count > 0;
      }
      return {
        changed,
        lastReadSeq: member.lastReadSeq,
        unreadCount: member.unreadCount,
        mentionCount: member.mentionsSinceRead,
      };
    }

    const base = {
      scopeType: "CONVERSATION" as const,
      scopeId: conversationId,
      threadKey: "root",
      seq: { gt: seq },
      deletedAt: null,
    };
    const unreadCount = await prisma.message.count({ where: { ...base, authorId: { not: userId } } });
    const mentionCount =
      unreadCount === 0
        ? 0
        : await prisma.message.count({
            where: { ...base, authorId: { not: userId }, mentions: { some: { type: "USER", targetId: userId } } },
          });

    const res = await prisma.conversationMember.updateMany({
      where: { id: member.id, status: "ACTIVE", lastReadSeq: { lt: seq } },
      data: { lastReadSeq: seq, lastReadAt: now, unreadCount, mentionsSinceRead: mentionCount, markedUnread: false },
    });
    if (res.count > 0) return { changed: true, lastReadSeq: seq, unreadCount, mentionCount };

    const fresh = await prisma.conversationMember.findUnique({ where: key });
    return {
      changed: false,
      lastReadSeq: fresh?.lastReadSeq ?? member.lastReadSeq,
      unreadCount: fresh?.unreadCount ?? member.unreadCount,
      mentionCount: fresh?.mentionsSinceRead ?? member.mentionsSinceRead,
    };
  }

  async listUnreadConversationTargets(
    userId: string,
    before: Date
  ): Promise<{ conversationId: string; lastSeq: number }[]> {
    const members = await prisma.conversationMember.findMany({
      where: {
        userId,
        status: "ACTIVE",
        activityAt: { lte: before },
        OR: [{ unreadCount: { gt: 0 } }, { markedUnread: true }],
      },
      select: { conversationId: true },
      take: 1000,
    });
    if (members.length === 0) return [];
    const convs = await prisma.conversation.findMany({
      where: { id: { in: members.map((m) => m.conversationId) } },
      select: { id: true, lastSeq: true },
    });
    return convs.map((c) => ({ conversationId: c.id, lastSeq: c.lastSeq }));
  }

  async getThreadReadSeqs(userId: string, threadIds: string[]): Promise<Map<string, number>> {
    if (threadIds.length === 0) return new Map();
    const rows = await prisma.readState.findMany({
      where: { userId, streamType: "THREAD", streamId: { in: threadIds } },
      select: { streamId: true, lastReadSeq: true },
    });
    return new Map(rows.map((r) => [r.streamId, r.lastReadSeq]));
  }
}
