import type { Prisma } from "@prisma/client";
import { prisma } from "../../../infrastructure/database";
import { AppError, NotFoundError } from "../../../core/exceptions";
import { ErrorCode, ErrorMessages } from "../../../core/utils/error.codes";
import type {
  AssertThreadableInput,
  OnReplyCreatedResult,
  ThreadHookReplyRef,
  ThreadHookRootRef,
  ThreadSummaryRef,
} from "../../../core/permission";
import { getReadStateReader } from "../../../core/permission";
import type { AuthUser } from "../../../core/types/express";
import { emitToRoom, emitToUsers } from "../../../infrastructure/socket/socket.emit";
import { ROOM } from "../../../infrastructure/socket";
import { SocketEvent } from "../../../infrastructure/socket/socket.events";
import { encodeCursor, decodeCursor } from "../../../core/utils/cursor";
import { getMessageScope } from "../../messages/public";
import type { MessageScope } from "../../messages/public";
import type { IThreadRepository } from "../repositories/thread.repository.interface";
import type { IThreadSubscriptionRepository } from "../repositories/thread-subscription.repository.interface";
import type { Thread, ThreadSubscription, ThreadSubscriptionStateValue, ThreadView } from "../entities/thread.interface";
import type { ThreadListQueryDto } from "../dtos/thread-list.dto";

function requireChannelScope(): MessageScope {
  const scope = getMessageScope("CHANNEL");
  if (!scope) throw new NotFoundError();
  return scope;
}

export interface ThreadListResult {
  data: ThreadView[];
  meta: { nextCursor: string | null; hasMore: boolean; limit: number };
}

/** be.md §5.3 — `assertThreadable`/`onReplyCreated` (cài đặt bởi `ThreadHookAdapter` cho port `IThreadHook`), API thread list/detail/subscription. */
export class ThreadService {
  constructor(
    private readonly threadRepo: IThreadRepository,
    private readonly subscriptionRepo: IThreadSubscriptionRepository
  ) {}

  /**
   * be.md §5.3 — root tồn tại, cùng kênh, `kind=USER`, `threadId=null`; hội
   * thoại (reply gửi vào CONVERSATION) → `MSG_018`; root là reply →
   * `MSG_019`; root tombstone CHƯA có thread → `MSG_006` (đã có thread thì
   * CHO PHÉP reply tiếp — be.md "cho phép reply vào tombstone đã có thread").
   */
  async assertThreadable(input: AssertThreadableInput): Promise<void> {
    const { root, replyScopeType, replyScopeId } = input;

    if (replyScopeType !== "CHANNEL") {
      throw new AppError(ErrorMessages[ErrorCode.MSG_018], 400, ErrorCode.MSG_018);
    }
    // Root không tồn tại / khác kênh / là tin hệ thống (tin khảo sát `POLL` của p7-04 là tin người dùng nên làm root được) — cùng mã MSG_006 mà
    // `message.service.ts#send()` đã dùng cho `replyToId` trỏ tới tin không
    // hợp lệ (be.md §5.3 không cấp mã riêng cho nhánh này).
    if (!root || root.scopeType !== "CHANNEL" || root.scopeId !== replyScopeId || root.kind === "SYSTEM") {
      throw new AppError(ErrorMessages[ErrorCode.MSG_006], 409, ErrorCode.MSG_006);
    }
    if (root.threadId !== null) {
      throw new AppError(ErrorMessages[ErrorCode.MSG_019], 400, ErrorCode.MSG_019);
    }
    if (root.deletedAt !== null) {
      const thread = await this.threadRepo.findByParentMessageId(root.id);
      if (!thread) throw new AppError(ErrorMessages[ErrorCode.MSG_006], 409, ErrorCode.MSG_006);
    }
  }

  /**
   * be.md §5.3 `onReplyCreated` — chạy TRONG transaction gửi reply, SAU khi
   * `Message` đã `create()`. Upsert `Thread` (`upsertOnReply` — race TH-01 đã
   * kiểm chứng thực nghiệm an toàn dựa vào lớp retry sẵn có ở
   * `message.service.ts#send()`, xem docstring `thread.repository.prisma.ts`),
   * rồi tạo `ThreadSubscription` `AUTO_ON` cho tác giả CHỈ khi chưa có lựa
   * chọn nào (TH-04 giữ `EXPLICIT_OFF`).
   */
  async onReplyCreated(
    tx: Prisma.TransactionClient,
    reply: ThreadHookReplyRef,
    root: ThreadHookRootRef
  ): Promise<OnReplyCreatedResult> {
    if (!reply.workspaceId) {
      // Không thể xảy ra trên đường thật (CHANNEL luôn resolve workspaceId
      // trước khi tới đây — `assertThreadable` đã xác nhận `replyScopeType
      // === "CHANNEL"`) — chặn cứng thay vì ghi `Thread.workspaceId` rỗng.
      throw new AppError("Thiếu workspaceId khi tạo thread", 500, ErrorCode.SYS_500);
    }

    const thread = await this.threadRepo.upsertOnReply(tx, {
      workspaceId: reply.workspaceId,
      channelId: root.scopeId,
      parentMessageId: root.id,
      parentAuthorId: root.authorId,
      seq: reply.seq,
      replyAt: reply.createdAt,
      replyAuthorId: reply.authorId,
    });

    if (reply.authorId) {
      const { created } = await this.subscriptionRepo.createAutoOnIfAbsent(
        tx,
        thread.id,
        root.scopeId,
        reply.authorId
      );
      if (created) await this.threadRepo.incrementSubscriberCount(tx, thread.id, 1);
    }

    return {
      threadId: thread.id,
      isFirstReply: thread.replyCount === 1,
      parentAuthorId: thread.parentAuthorId,
    };
  }

  /**
   * be.md §7 — gọi SAU commit từ outbox handler `message.created` khi
   * `message.threadId` khác null. QUAN TRỌNG: `message.threadId` (và
   * `dto.threadRootId` phía `message.service.ts#send()`) lưu id của TIN GỐC
   * (root message) — CHÍNH LÀ `Thread.parentMessageId`, KHÔNG PHẢI
   * `Thread.id` — nên tra bằng `findByParentMessageId()`, không phải `findById()`.
   */
  async emitThreadUpdated(rootMessageId: string): Promise<void> {
    const thread = await this.threadRepo.findByParentMessageId(rootMessageId);
    if (!thread) return;
    emitToRoom(ROOM.channel(thread.channelId), SocketEvent.THREAD_UPDATED, {
      threadId: thread.id,
      parentMessageId: thread.parentMessageId,
      replyCount: thread.replyCount,
      lastReplyAt: thread.lastReplyAt,
      lastReplierIds: thread.lastReplierIds,
      lastReplySeq: thread.lastReplySeq,
    });
  }

  /**
   * be.md §4 `IThreadHook.summaries` — tóm tắt thread của NHIỀU tin gốc bằng
   * ĐÚNG 1 truy vấn (`findByParentMessageIds`, `parentMessageId in ids`), không
   * N+1 theo số tin trong trang. Không kiểm quyền: caller (`MessageService`)
   * đã kiểm quyền đọc scope của các tin này trước khi tới đây. Key = id TIN GỐC.
   */
  async summaries(rootMessageIds: string[]): Promise<Map<string, ThreadSummaryRef>> {
    const ids = [...new Set(rootMessageIds)];
    if (ids.length === 0) return new Map();
    const threads = await this.threadRepo.findByParentMessageIds(ids);
    return new Map(
      threads.map((t) => [
        t.parentMessageId,
        {
          threadId: t.id,
          replyCount: t.replyCount,
          lastReplyAt: t.lastReplyAt,
          lastReplierIds: t.lastReplierIds,
          lastReplySeq: t.lastReplySeq,
        },
      ])
    );
  }

  /** `GET /threads/:id`. */
  async getView(user: AuthUser, threadId: string): Promise<ThreadView> {
    const thread = await this.threadRepo.findById(threadId);
    if (!thread) throw new NotFoundError();
    const scope = requireChannelScope();
    const access = await scope.canRead(user, thread.channelId);
    if (!access.visible) throw new NotFoundError();
    const mySub = await this.subscriptionRepo.findByThreadAndUser(threadId, user.id);
    return this.toView(thread, mySub, await this.myReadSeqs(user.id, [thread.id]));
  }

  /** `GET /messages/:id/thread` — caller (controller) đã kiểm quyền đọc root qua `MessageService.get()`, không kiểm lại. `null` nếu root chưa có reply nào (chưa có `Thread`). */
  async getViewByParentMessageId(user: AuthUser, parentMessageId: string): Promise<ThreadView | null> {
    const thread = await this.threadRepo.findByParentMessageId(parentMessageId);
    if (!thread) return null;
    const mySub = await this.subscriptionRepo.findByThreadAndUser(thread.id, user.id);
    return this.toView(thread, mySub, await this.myReadSeqs(user.id, [thread.id]));
  }

  /** `PUT /threads/:id/subscription` — `EXPLICIT_ON`/`EXPLICIT_OFF`, đồng bộ đa thiết bị qua socket. */
  async setSubscription(
    user: AuthUser,
    threadId: string,
    state: Extract<ThreadSubscriptionStateValue, "EXPLICIT_ON" | "EXPLICIT_OFF">
  ): Promise<{ threadId: string; state: ThreadSubscriptionStateValue }> {
    const thread = await this.threadRepo.findById(threadId);
    if (!thread) throw new NotFoundError();
    const scope = requireChannelScope();
    const access = await scope.canRead(user, thread.channelId);
    if (!access.visible) throw new NotFoundError();

    const { created } = await this.subscriptionRepo.setState(threadId, thread.channelId, user.id, state);
    if (created) {
      // Cập nhật `subscriberCount` ngoài transaction gửi reply — best-effort,
      // không nhạy CAS (chỉ dùng để cảnh báo fan-out lớn, `LIMITS.thread.subscribersMax`).
      await this.incrementSubscriberCountBestEffort(threadId, 1);
    }

    emitToUsers([user.id], SocketEvent.THREAD_SUBSCRIPTION_UPDATED, { threadId, state });
    return { threadId, state };
  }

  /** `GET /channels/:id/threads?filter=following|all&cursor=` (P1). */
  async listByChannel(user: AuthUser, channelId: string, query: ThreadListQueryDto): Promise<ThreadListResult> {
    let threadIds: string[] | undefined;
    if (query.filter === "following") {
      threadIds = await this.subscriptionRepo.listActiveThreadIdsByUser(user.id, channelId);
      if (threadIds.length === 0) return { data: [], meta: { nextCursor: null, hasMore: false, limit: query.limit } };
    }

    const cursor = query.cursor ? decodeCursor(query.cursor) : null;
    const rows = await this.threadRepo.listByChannel({
      channelId,
      threadIds,
      cursor,
      limit: query.limit + 1,
    });
    const hasMore = rows.length > query.limit;
    const page = rows.slice(0, query.limit);

    const mySubs = await this.subscriptionRepo.findManyByThreadIds(page.map((t) => t.id), user.id);
    const readSeqs = await this.myReadSeqs(user.id, page.map((t) => t.id));
    const data = page.map((t) => this.toView(t, mySubs.get(t.id) ?? null, readSeqs));

    const last = page[page.length - 1];
    const nextCursor = hasMore && last?.lastReplyAt ? encodeCursor(last.lastReplyAt, last.id) : null;
    return { data, meta: { nextCursor, hasMore, limit: query.limit } };
  }

  /** p1-07 — mốc đọc thread của tôi (`ReadState THREAD`) qua cổng `IReadStateReader`; chưa đăng ký/lỗi → `null` (giữ hành vi cũ). */
  private async myReadSeqs(userId: string, threadIds: string[]): Promise<Map<string, number> | null> {
    const reader = getReadStateReader();
    if (!reader || threadIds.length === 0) return null;
    try {
      return await reader.getThreadReadSeqs(userId, threadIds);
    } catch {
      return null;
    }
  }

  private toView(thread: Thread, mySub: ThreadSubscription | null, readSeqs: Map<string, number> | null = null): ThreadView {
    const readSeq = readSeqs ? (readSeqs.get(thread.id) ?? 0) : null;
    return {
      id: thread.id,
      channelId: thread.channelId,
      parentMessageId: thread.parentMessageId,
      replyCount: thread.replyCount,
      lastReplyAt: thread.lastReplyAt,
      lastReplierIds: thread.lastReplierIds,
      mySubscription: mySub?.state ?? null,
      // p1-07 — `ReadState THREAD`; `unreadReplies` xấp xỉ theo seq (gồm cả reply của chính mình).
      myLastReadSeq: readSeq,
      unreadReplies: readSeq === null ? 0 : Math.max(0, thread.lastReplySeq - readSeq),
    };
  }

  private async incrementSubscriberCountBestEffort(threadId: string, delta: number): Promise<void> {
    // `incrementSubscriberCount` trên interface nhận `Prisma.TransactionClient`
    // (dùng trong `onReplyCreated`) — ở đây KHÔNG có transaction đang mở
    // (setSubscription là thao tác đơn user, không cần ACID với gì khác), nên
    // gọi qua `prisma` thẳng bằng 1 `update` nhẹ, KHÔNG qua repository method
    // (tránh ép interface nhận `tx` optional chỉ vì 1 call site ngoài tx).
    await prisma.thread.update({ where: { id: threadId }, data: { subscriberCount: { increment: delta } } });
  }
}
