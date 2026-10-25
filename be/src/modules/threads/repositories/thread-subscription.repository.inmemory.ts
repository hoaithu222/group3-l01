import type { Prisma } from "@prisma/client";
import { newObjectId } from "../../../core/utils/object-id";
import type { ThreadSubscription, ThreadSubscriptionStateValue } from "../entities/thread.interface";
import type { IThreadSubscriptionRepository, PrismaOrTx } from "./thread-subscription.repository.interface";

const ACTIVE_STATES: ThreadSubscriptionStateValue[] = ["AUTO_ON", "EXPLICIT_ON"];

export class InMemoryThreadSubscriptionRepository implements IThreadSubscriptionRepository {
  private readonly rows = new Map<string, ThreadSubscription>();

  private find(threadId: string, userId: string): ThreadSubscription | undefined {
    return [...this.rows.values()].find((s) => s.threadId === threadId && s.userId === userId);
  }

  async findByThreadAndUser(threadId: string, userId: string, _c?: PrismaOrTx): Promise<ThreadSubscription | null> {
    return this.find(threadId, userId) ?? null;
  }

  async findManyByThreadIds(
    threadIds: string[],
    userId: string,
    _c?: PrismaOrTx
  ): Promise<Map<string, ThreadSubscription>> {
    const set = new Set(threadIds);
    const map = new Map<string, ThreadSubscription>();
    for (const s of this.rows.values()) {
      if (s.userId === userId && set.has(s.threadId)) map.set(s.threadId, s);
    }
    return map;
  }

  async setState(
    threadId: string,
    channelId: string,
    userId: string,
    state: ThreadSubscriptionStateValue
  ): Promise<{ subscription: ThreadSubscription; created: boolean }> {
    const existing = this.find(threadId, userId);
    const now = new Date();
    if (existing) {
      const updated = { ...existing, state, updatedAt: now };
      this.rows.set(updated.id, updated);
      return { subscription: updated, created: false };
    }
    const created: ThreadSubscription = {
      id: newObjectId(),
      threadId,
      channelId,
      userId,
      state,
      createdAt: now,
      updatedAt: now,
    };
    this.rows.set(created.id, created);
    return { subscription: created, created: true };
  }

  async createAutoOnIfAbsent(
    _tx: Prisma.TransactionClient,
    threadId: string,
    channelId: string,
    userId: string
  ): Promise<{ created: boolean }> {
    if (this.find(threadId, userId)) return { created: false };
    const now = new Date();
    const created: ThreadSubscription = {
      id: newObjectId(),
      threadId,
      channelId,
      userId,
      state: "AUTO_ON",
      createdAt: now,
      updatedAt: now,
    };
    this.rows.set(created.id, created);
    return { created: true };
  }

  async listActiveThreadIdsByUser(userId: string, channelId: string): Promise<string[]> {
    return [...this.rows.values()]
      .filter((s) => s.userId === userId && s.channelId === channelId && ACTIVE_STATES.includes(s.state))
      .map((s) => s.threadId);
  }

  async listActiveSubscribers(
    threadId: string,
    opts: { cursor?: string | null; limit: number; excludeUserId?: string }
  ): Promise<{ data: { userId: string; state: ThreadSubscriptionStateValue }[]; nextCursor: string | null }> {
    let rows = [...this.rows.values()]
      .filter((s) => s.threadId === threadId && ACTIVE_STATES.includes(s.state))
      .sort((a, b) => a.id.localeCompare(b.id));
    if (opts.excludeUserId) rows = rows.filter((s) => s.userId !== opts.excludeUserId);
    if (opts.cursor) rows = rows.filter((s) => s.id > (opts.cursor as string));
    const hasMore = rows.length > opts.limit;
    const page = rows.slice(0, opts.limit);
    return {
      data: page.map((s) => ({ userId: s.userId, state: s.state })),
      nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null,
    };
  }

  seed(sub: ThreadSubscription): void {
    this.rows.set(sub.id, sub);
  }

  clear(): void {
    this.rows.clear();
  }
}
