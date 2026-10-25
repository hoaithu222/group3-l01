import type { Prisma } from "@prisma/client";
import { prisma } from "../../../infrastructure/database";
import { LIMITS } from "../../../core/constants/limits";
import type { Thread } from "../entities/thread.interface";
import type {
  IThreadRepository,
  ListThreadsByChannelParams,
  PrismaOrTx,
} from "./thread.repository.interface";

type ThreadRecord = NonNullable<Awaited<ReturnType<typeof prisma.thread.findUnique>>>;

function mapThread(r: ThreadRecord): Thread {
  return {
    id: r.id,
    workspaceId: r.workspaceId,
    channelId: r.channelId,
    parentMessageId: r.parentMessageId,
    parentAuthorId: r.parentAuthorId,
    replyCount: r.replyCount,
    lastReplySeq: r.lastReplySeq,
    lastReplyAt: r.lastReplyAt,
    lastReplierIds: r.lastReplierIds,
    subscriberCount: r.subscriberCount,
    version: r.version,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

function client(c?: PrismaOrTx) {
  return c ?? prisma;
}

export class PrismaThreadRepository implements IThreadRepository {
  async findById(id: string, c?: PrismaOrTx): Promise<Thread | null> {
    const r = await client(c).thread.findUnique({ where: { id } });
    return r ? mapThread(r) : null;
  }

  async findByParentMessageId(parentMessageId: string, c?: PrismaOrTx): Promise<Thread | null> {
    const r = await client(c).thread.findUnique({ where: { parentMessageId } });
    return r ? mapThread(r) : null;
  }

  async findByParentMessageIds(parentMessageIds: string[], c?: PrismaOrTx): Promise<Thread[]> {
    if (parentMessageIds.length === 0) return [];
    const rs = await client(c).thread.findMany({ where: { parentMessageId: { in: parentMessageIds } } });
    return rs.map(mapThread);
  }

  async listByChannel(params: ListThreadsByChannelParams, c?: PrismaOrTx): Promise<Thread[]> {
    const where: Prisma.ThreadWhereInput = {
      channelId: params.channelId,
      ...(params.threadIds && { id: { in: params.threadIds } }),
      ...(params.cursor && {
        OR: [
          { lastReplyAt: { lt: params.cursor.at } },
          { lastReplyAt: params.cursor.at, id: { lt: params.cursor.id } },
        ],
      }),
    };
    const rs = await client(c).thread.findMany({
      where,
      orderBy: [{ lastReplyAt: "desc" }, { id: "desc" }],
      take: params.limit,
    });
    return rs.map(mapThread);
  }

  /**
   * `tx.thread.upsert()` thường (KHÔNG raw `$runCommandRaw`) — xác nhận
   * bằng thực nghiệm (8 transaction đồng thời qua `withTransaction()` +
   * `withWriteConflictRetry` giống `message.service.ts#send()`) rằng Mongo
   * connector của Prisma biên dịch upsert đơn giản (không có nested write)
   * thành 1 `updateMany` dạng pipeline với `upsert:true` — atomic ở tầng
   * Mongo, KHÔNG bao giờ tạo 2 `Thread` cho cùng `parentMessageId`. Dưới tải
   * đồng thời cao có thể ném lỗi transient (write conflict, KHÔNG PHẢI
   * P2002) — để lỗi đó propagate nguyên vẹn ra ngoài, lớp retry sẵn có ở
   * `message.service.ts#send()` xử lý (mục 5 "critical facts" của tác vụ).
   */
  async upsertOnReply(
    tx: Prisma.TransactionClient,
    input: {
      workspaceId: string;
      channelId: string;
      parentMessageId: string;
      parentAuthorId: string | null;
      seq: number;
      replyAt: Date;
      replyAuthorId: string | null;
    }
  ): Promise<Thread> {
    const existing = await tx.thread.findUnique({
      where: { parentMessageId: input.parentMessageId },
      select: { lastReplierIds: true },
    });
    const prevReplierIds = existing?.lastReplierIds ?? [];
    const nextReplierIds = input.replyAuthorId
      ? [input.replyAuthorId, ...prevReplierIds.filter((id) => id !== input.replyAuthorId)].slice(
          0,
          LIMITS.thread.lastRepliersMax
        )
      : prevReplierIds;

    const r = await tx.thread.upsert({
      where: { parentMessageId: input.parentMessageId },
      create: {
        workspaceId: input.workspaceId,
        channelId: input.channelId,
        parentMessageId: input.parentMessageId,
        parentAuthorId: input.parentAuthorId,
        replyCount: 1,
        lastReplySeq: input.seq,
        lastReplyAt: input.replyAt,
        lastReplierIds: input.replyAuthorId ? [input.replyAuthorId] : [],
        subscriberCount: 0,
        version: 1,
      },
      update: {
        replyCount: { increment: 1 },
        lastReplySeq: input.seq,
        lastReplyAt: input.replyAt,
        lastReplierIds: nextReplierIds,
        version: { increment: 1 },
      },
    });
    return mapThread(r);
  }

  async incrementSubscriberCount(tx: Prisma.TransactionClient, threadId: string, delta: number): Promise<void> {
    await tx.thread.update({ where: { id: threadId }, data: { subscriberCount: { increment: delta } } });
  }
}
