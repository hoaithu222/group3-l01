import type { Prisma } from "@prisma/client";
import { prisma } from "../../../infrastructure/database";
import type { ThreadSubscription, ThreadSubscriptionStateValue } from "../entities/thread.interface";
import type {
  IThreadSubscriptionRepository,
  PrismaOrTx,
} from "./thread-subscription.repository.interface";

type SubRecord = NonNullable<Awaited<ReturnType<typeof prisma.threadSubscription.findUnique>>>;

function mapSub(r: SubRecord): ThreadSubscription {
  return {
    id: r.id,
    threadId: r.threadId,
    channelId: r.channelId,
    userId: r.userId,
    state: r.state as ThreadSubscriptionStateValue,
    updatedAt: r.updatedAt,
    createdAt: r.createdAt,
  };
}

function client(c?: PrismaOrTx) {
  return c ?? prisma;
}

const ACTIVE_STATES: ThreadSubscriptionStateValue[] = ["AUTO_ON", "EXPLICIT_ON"];

export class PrismaThreadSubscriptionRepository implements IThreadSubscriptionRepository {
  async findByThreadAndUser(threadId: string, userId: string, c?: PrismaOrTx): Promise<ThreadSubscription | null> {
    const r = await client(c).threadSubscription.findUnique({ where: { threadId_userId: { threadId, userId } } });
    return r ? mapSub(r) : null;
  }

  async findManyByThreadIds(
    threadIds: string[],
    userId: string,
    c?: PrismaOrTx
  ): Promise<Map<string, ThreadSubscription>> {
    if (threadIds.length === 0) return new Map();
    const rs = await client(c).threadSubscription.findMany({
      where: { threadId: { in: threadIds }, userId },
    });
    return new Map(rs.map((r) => [r.threadId, mapSub(r)]));
  }

  async setState(
    threadId: string,
    channelId: string,
    userId: string,
    state: ThreadSubscriptionStateValue
  ): Promise<{ subscription: ThreadSubscription; created: boolean }> {
    const existing = await prisma.threadSubscription.findUnique({ where: { threadId_userId: { threadId, userId } } });
    const r = await prisma.threadSubscription.upsert({
      where: { threadId_userId: { threadId, userId } },
      create: { threadId, channelId, userId, state },
      update: { state },
    });
    return { subscription: mapSub(r), created: !existing };
  }

  async createAutoOnIfAbsent(
    tx: Prisma.TransactionClient,
    threadId: string,
    channelId: string,
    userId: string
  ): Promise<{ created: boolean }> {
    const existing = await tx.threadSubscription.findUnique({ where: { threadId_userId: { threadId, userId } } });
    if (existing) return { created: false };
    await tx.threadSubscription.create({ data: { threadId, channelId, userId, state: "AUTO_ON" } });
    return { created: true };
  }

  async listActiveThreadIdsByUser(userId: string, channelId: string): Promise<string[]> {
    const rows = await prisma.threadSubscription.findMany({
      where: { userId, channelId, state: { in: ACTIVE_STATES } },
      select: { threadId: true },
    });
    return rows.map((r) => r.threadId);
  }

  async listActiveSubscribers(
    threadId: string,
    opts: { cursor?: string | null; limit: number; excludeUserId?: string }
  ): Promise<{ data: { userId: string; state: ThreadSubscriptionStateValue }[]; nextCursor: string | null }> {
    const where: Prisma.ThreadSubscriptionWhereInput = {
      threadId,
      state: { in: ACTIVE_STATES },
      ...(opts.excludeUserId && { userId: { not: opts.excludeUserId } }),
      ...(opts.cursor && { id: { gt: opts.cursor } }),
    };
    const rows = await prisma.threadSubscription.findMany({
      where,
      orderBy: { id: "asc" },
      take: opts.limit + 1,
      select: { id: true, userId: true, state: true },
    });
    const hasMore = rows.length > opts.limit;
    const page = rows.slice(0, opts.limit);
    return {
      data: page.map((r) => ({ userId: r.userId, state: r.state as ThreadSubscriptionStateValue })),
      nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null,
    };
  }
}
