import type { Prisma, PrismaClient } from "@prisma/client";
import type { ThreadSubscription, ThreadSubscriptionStateValue } from "../entities/thread.interface";

export type PrismaOrTx = PrismaClient | Prisma.TransactionClient;

export interface IThreadSubscriptionRepository {
  findByThreadAndUser(threadId: string, userId: string, client?: PrismaOrTx): Promise<ThreadSubscription | null>;
  /** Batch cho 1 trang `ThreadView[]` — trả Map threadId → subscription của viewer. */
  findManyByThreadIds(threadIds: string[], userId: string, client?: PrismaOrTx): Promise<Map<string, ThreadSubscription>>;

  /**
   * `PUT /threads/:id/subscription` — set `EXPLICIT_ON`/`EXPLICIT_OFF` (ghi
   * đè state, kể cả khi đã có bản ghi). Trả `created=true` khi đây là bản ghi
   * MỚI (service tự tăng `Thread.subscriberCount`).
   */
  setState(
    threadId: string,
    channelId: string,
    userId: string,
    state: ThreadSubscriptionStateValue
  ): Promise<{ subscription: ThreadSubscription; created: boolean }>;

  /**
   * be.md §5.3 `onReplyCreated` bước 3 — upsert CHỈ CREATE `AUTO_ON` khi tác
   * giả reply CHƯA có lựa chọn nào; đã có (kể cả `EXPLICIT_OFF`) → giữ
   * nguyên, KHÔNG update state (TH-04). Chạy TRONG transaction gửi reply.
   */
  createAutoOnIfAbsent(
    tx: Prisma.TransactionClient,
    threadId: string,
    channelId: string,
    userId: string
  ): Promise<{ created: boolean }>;

  /** `filter=following` — `AUTO_ON`/`EXPLICIT_ON`, loại `EXPLICIT_OFF`. */
  listActiveThreadIdsByUser(userId: string, channelId: string): Promise<string[]>;

  /**
   * p1-07 be.md §5.4 "Fan-out thread subscribers ... qua port
   * `IThreadSubscriberReader.list(threadId, cursor)`" — CHỈ export plain
   * function này (không dựng registry/port riêng, chưa có caller thật) qua
   * `modules/threads/public.ts`. `AUTO_ON`/`EXPLICIT_ON`, trừ `excludeUserId`
   * (tác giả reply vừa gửi — không tự thông báo cho mình).
   */
  listActiveSubscribers(
    threadId: string,
    opts: { cursor?: string | null; limit: number; excludeUserId?: string }
  ): Promise<{ data: { userId: string; state: ThreadSubscriptionStateValue }[]; nextCursor: string | null }>;
}
