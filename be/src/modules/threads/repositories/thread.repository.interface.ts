import type { Prisma, PrismaClient } from "@prisma/client";
import type { Thread } from "../entities/thread.interface";

export type PrismaOrTx = PrismaClient | Prisma.TransactionClient;

export interface ThreadCursor {
  at: Date;
  id: string;
}

export interface ListThreadsByChannelParams {
  channelId: string;
  /** Lọc theo tập threadId (dùng cho `filter=following`) — `undefined` = không lọc (`filter=all`). */
  threadIds?: string[];
  cursor?: ThreadCursor | null;
  /** Repository trả `limit + 1` dòng để service tự suy `hasMore`. */
  limit: number;
}

export interface IThreadRepository {
  findById(id: string, client?: PrismaOrTx): Promise<Thread | null>;
  findByParentMessageId(parentMessageId: string, client?: PrismaOrTx): Promise<Thread | null>;
  findByParentMessageIds(parentMessageIds: string[], client?: PrismaOrTx): Promise<Thread[]>;
  listByChannel(params: ListThreadsByChannelParams, client?: PrismaOrTx): Promise<Thread[]>;

  /**
   * be.md §5.3 `onReplyCreated` bước 1+2 — upsert `Thread` theo
   * `parentMessageId` TRONG transaction gửi reply. Race 2 reply đầu đồng thời
   * (TH-01) đã kiểm chứng thực nghiệm là AN TOÀN dựa vào lớp retry SẴN CÓ ở
   * `message.service.ts#send()` (`withWriteConflictRetry` bọc ngoài
   * `withTransaction()`, tổng 9 lần thử) — KHÔNG thêm retry/catch P2002 thủ
   * công ở đây (mục 5 "critical facts" của tác vụ: để lỗi propagate ra ngoài
   * `withTransaction()` thay vì catch-and-continue trong transaction đang mở).
   */
  upsertOnReply(
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
  ): Promise<Thread>;

  incrementSubscriberCount(tx: Prisma.TransactionClient, threadId: string, delta: number): Promise<void>;
}
