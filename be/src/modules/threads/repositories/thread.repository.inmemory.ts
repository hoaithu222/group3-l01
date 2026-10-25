import type { Prisma } from "@prisma/client";
import { LIMITS } from "../../../core/constants/limits";
import { newObjectId } from "../../../core/utils/object-id";
import type { Thread } from "../entities/thread.interface";
import type {
  IThreadRepository,
  ListThreadsByChannelParams,
  PrismaOrTx,
} from "./thread.repository.interface";

/** Dùng cho unit test (không cần Mongo) — giữ semantics gần nhất với `PrismaThreadRepository` (upsert-on-reply, cursor desc). */
export class InMemoryThreadRepository implements IThreadRepository {
  private readonly rows = new Map<string, Thread>();

  async findById(id: string, _c?: PrismaOrTx): Promise<Thread | null> {
    return this.rows.get(id) ?? null;
  }

  async findByParentMessageId(parentMessageId: string, _c?: PrismaOrTx): Promise<Thread | null> {
    return [...this.rows.values()].find((t) => t.parentMessageId === parentMessageId) ?? null;
  }

  async findByParentMessageIds(parentMessageIds: string[], _c?: PrismaOrTx): Promise<Thread[]> {
    const set = new Set(parentMessageIds);
    return [...this.rows.values()].filter((t) => set.has(t.parentMessageId));
  }

  async listByChannel(params: ListThreadsByChannelParams, _c?: PrismaOrTx): Promise<Thread[]> {
    let rows = [...this.rows.values()].filter((t) => t.channelId === params.channelId);
    if (params.threadIds) {
      const set = new Set(params.threadIds);
      rows = rows.filter((t) => set.has(t.id));
    }
    rows.sort((a, b) => {
      const at = (b.lastReplyAt?.getTime() ?? 0) - (a.lastReplyAt?.getTime() ?? 0);
      return at !== 0 ? at : b.id.localeCompare(a.id);
    });
    if (params.cursor) {
      const { at, id } = params.cursor;
      rows = rows.filter((t) => {
        const tAt = t.lastReplyAt?.getTime() ?? 0;
        if (tAt < at.getTime()) return true;
        if (tAt === at.getTime()) return t.id < id;
        return false;
      });
    }
    return rows.slice(0, params.limit);
  }

  async upsertOnReply(
    _tx: Prisma.TransactionClient,
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
    const existing = await this.findByParentMessageId(input.parentMessageId);
    if (!existing) {
      const created: Thread = {
        id: newObjectId(),
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
        createdAt: input.replyAt,
        updatedAt: input.replyAt,
      };
      this.rows.set(created.id, created);
      return created;
    }
    const nextReplierIds = input.replyAuthorId
      ? [input.replyAuthorId, ...existing.lastReplierIds.filter((id) => id !== input.replyAuthorId)].slice(
          0,
          LIMITS.thread.lastRepliersMax
        )
      : existing.lastReplierIds;
    const updated: Thread = {
      ...existing,
      replyCount: existing.replyCount + 1,
      lastReplySeq: input.seq,
      lastReplyAt: input.replyAt,
      lastReplierIds: nextReplierIds,
      version: existing.version + 1,
      updatedAt: input.replyAt,
    };
    this.rows.set(updated.id, updated);
    return updated;
  }

  async incrementSubscriberCount(_tx: Prisma.TransactionClient, threadId: string, delta: number): Promise<void> {
    const existing = this.rows.get(threadId);
    if (!existing) return;
    this.rows.set(threadId, { ...existing, subscriberCount: existing.subscriberCount + delta });
  }

  /** Chỉ test — chèn thẳng 1 Thread cho fixture. */
  seed(thread: Thread): void {
    this.rows.set(thread.id, thread);
  }

  clear(): void {
    this.rows.clear();
  }
}
