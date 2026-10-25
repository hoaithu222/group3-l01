import { AppError, NotFoundError } from "../../../core/exceptions";
import { ErrorCode, ErrorMessages } from "../../../core/utils/error.codes";
import type { AuthUser } from "../../../core/types/express";
import type { IReadReceiptPublisher } from "../../../core/permission";
import { SocketEvent } from "../../../infrastructure/socket/socket.events";
import { logger } from "../../../infrastructure/logger";
import type { IReadStateRepository } from "../repositories/read-state.repository.interface";
import type { MarkResult, ReadStreamTypeValue, ResolvedStream } from "../entities/read-state.interface";
import type { UnreadCache, UnreadSummaryChangedReason } from "./unread-cache";

export interface MarkReadDto {
  streamType: ReadStreamTypeValue;
  streamId: string;
  lastReadSeq: number;
  deviceId?: string;
}

/** Payload job `notifications.mark-read-by-stream` (xử lý ở `modules/notifications/jobs/mark-read-by-stream.job.ts`). */
export interface MarkReadJob {
  userId: string;
  scopeType: "CHANNEL" | "CONVERSATION";
  scopeId: string;
  streamKey: string;
  seq: number;
}

/** Phụ thuộc hạ tầng/module khác — inject để test đơn vị không cần Redis/Socket/BullMQ thật. */
export interface ReadMarkerDeps {
  canRead(
    user: AuthUser,
    scopeType: "CHANNEL" | "CONVERSATION",
    scopeId: string
  ): Promise<{ visible: boolean; workspaceId: string | null }>;
  emitToUser(userId: string, event: string, payload: object): void;
  enqueueMarkRead(job: MarkReadJob): Promise<void>;
  getReceiptPublisher(): IReadReceiptPublisher | null;
  notifySummaryChanged(userId: string, reason: UnreadSummaryChangedReason): Promise<void>;
  now?: () => Date;
}

const FUTURE_SKEW_MS = 5 * 60_000;
const READ_ALL_CHUNK = 20;
const READ_ALL_RECEIPT_MAX = 100;

/**
 * `ReadMarkerService` (be.md §5.1) — mốc đọc CHỈ TĂNG (`updateMany where lastReadSeq < seq` ≡ `$max`),
 * kẹp theo `lastSeq` của luồng. Không đổi → trả hiện trạng (NT-03). Đổi → phát `read:updated` tới
 * `user:{me}` (đồng bộ đa thiết bị, NT-11), `read:receipt` (hội thoại, qua cổng p1-05), xoá cache
 * đếm và xếp job đánh dấu mục hộp thư của luồng đã đọc (NT-12).
 */
export class ReadMarkerService {
  constructor(
    private readonly repo: IReadStateRepository,
    private readonly cache: UnreadCache,
    private readonly deps: ReadMarkerDeps
  ) {}

  private now(): Date {
    return this.deps.now ? this.deps.now() : new Date();
  }

  async mark(user: AuthUser, dto: MarkReadDto): Promise<MarkResult> {
    const stream = await this.resolveStream(user, dto.streamType, dto.streamId);
    const seq = Math.max(0, Math.min(dto.lastReadSeq, stream.lastSeq));
    const now = this.now();

    if (stream.streamType === "CONVERSATION") {
      const adv = await this.repo.advanceConversationMember({ conversationId: stream.streamId, userId: user.id, seq, now });
      if (!adv) throw new NotFoundError();
      const result: MarkResult = { streamType: "CONVERSATION", streamId: stream.streamId, lastReadSeq: adv.lastReadSeq, changed: adv.changed };
      if (adv.changed) {
        await this.afterChange(user.id, stream, adv.lastReadSeq, now, dto.deviceId, {
          unreadCount: adv.unreadCount,
          mentionCount: adv.mentionCount,
        });
      }
      return result;
    }

    const res = await this.repo.advanceReadState({
      userId: user.id,
      streamType: stream.streamType,
      streamId: stream.streamId,
      workspaceId: stream.workspaceId as string,
      channelId: stream.channelId as string,
      seq,
      now,
    });
    if (res.changed) await this.afterChange(user.id, stream, res.lastReadSeq, now, dto.deviceId, {});
    return { streamType: stream.streamType, streamId: stream.streamId, lastReadSeq: res.lastReadSeq, changed: res.changed };
  }

  /** `POST /me/read-all-conversations { before }` — chỉ đụng hội thoại có `activityAt ≤ before` (NT-13). */
  async readAllConversations(user: AuthUser, before: Date): Promise<{ updated: number }> {
    if (before.getTime() > this.now().getTime() + FUTURE_SKEW_MS) {
      throw new AppError(ErrorMessages[ErrorCode.NOTI_003], 400, ErrorCode.NOTI_003);
    }
    const targets = await this.repo.listUnreadConversationTargets(user.id, before);
    const publisher = this.deps.getReceiptPublisher();
    const now = this.now();
    let updated = 0;

    for (let i = 0; i < targets.length; i += READ_ALL_CHUNK) {
      await Promise.all(
        targets.slice(i, i + READ_ALL_CHUNK).map(async (t) => {
          const adv = await this.repo.advanceConversationMember({
            conversationId: t.conversationId,
            userId: user.id,
            seq: t.lastSeq,
            now,
          });
          if (!adv?.changed) return;
          updated += 1;
          if (publisher && updated <= READ_ALL_RECEIPT_MAX) {
            await publisher.publish(t.conversationId, user.id, adv.lastReadSeq, now).catch(() => undefined);
          }
          await this.enqueueInboxMark(user.id, "CONVERSATION", t.conversationId, "root", adv.lastReadSeq);
        })
      );
    }

    if (updated > 0) await this.deps.notifySummaryChanged(user.id, "READ_ALL");
    return { updated };
  }

  private async resolveStream(user: AuthUser, streamType: ReadStreamTypeValue, streamId: string): Promise<ResolvedStream> {
    if (streamType === "CONVERSATION") {
      const access = await this.deps.canRead(user, "CONVERSATION", streamId);
      if (!access.visible) throw new NotFoundError();
      const lastSeq = await this.repo.findConversationLastSeq(streamId);
      if (lastSeq === null) throw new NotFoundError();
      return {
        streamType, streamId, scopeType: "CONVERSATION", scopeId: streamId,
        workspaceId: access.workspaceId, channelId: null, lastSeq, streamKey: "root",
      };
    }

    if (streamType === "CHANNEL") {
      const access = await this.deps.canRead(user, "CHANNEL", streamId);
      if (!access.visible) throw new NotFoundError();
      const info = await this.repo.findChannelInfo(streamId);
      if (!info) throw new NotFoundError();
      return {
        streamType, streamId, scopeType: "CHANNEL", scopeId: streamId,
        workspaceId: info.workspaceId, channelId: streamId, lastSeq: info.lastSeq, streamKey: "root",
      };
    }

    const thread = await this.repo.findThreadInfo(streamId);
    if (!thread) throw new NotFoundError();
    const access = await this.deps.canRead(user, "CHANNEL", thread.channelId);
    if (!access.visible) throw new NotFoundError();
    // Chuẩn hoá: mốc lưu theo `Thread.id` (kể cả khi client gửi id tin gốc), còn khoá hộp thư theo id TIN GỐC — đúng thứ
    // fan-out ghi vào `NotificationRecipient.streamKey` (= `Message.threadId`), nếu không mục trong luồng không bao giờ tự đọc (NT-12).
    return {
      streamType, streamId: thread.id, scopeType: "CHANNEL", scopeId: thread.channelId,
      workspaceId: thread.workspaceId, channelId: thread.channelId, lastSeq: thread.lastReplySeq, streamKey: thread.parentMessageId,
    };
  }

  private async afterChange(
    userId: string,
    stream: ResolvedStream,
    lastReadSeq: number,
    now: Date,
    originDeviceId: string | undefined,
    extra: { unreadCount?: number; mentionCount?: number }
  ): Promise<void> {
    await this.cache.invalidateSummary(userId);
    if (stream.channelId) await this.cache.invalidateChannel(userId, stream.channelId);

    try {
      this.deps.emitToUser(userId, SocketEvent.READ_UPDATED, {
        streamType: stream.streamType,
        streamId: stream.streamId,
        lastReadSeq,
        ...(extra.unreadCount !== undefined && { unreadCount: extra.unreadCount }),
        ...(extra.mentionCount !== undefined && { mentionCount: extra.mentionCount }),
        ...(originDeviceId && { originDeviceId }),
      });
    } catch (err) {
      logger.warn("[read-marker] Không phát được read:updated", { error: err instanceof Error ? err.message : String(err) });
    }

    if (stream.streamType === "CONVERSATION") {
      const publisher = this.deps.getReceiptPublisher();
      if (publisher) await publisher.publish(stream.streamId, userId, lastReadSeq, now).catch(() => undefined);
    }
    await this.enqueueInboxMark(userId, stream.scopeType, stream.scopeId, stream.streamKey, lastReadSeq);
  }

  private async enqueueInboxMark(
    userId: string,
    scopeType: "CHANNEL" | "CONVERSATION",
    scopeId: string,
    streamKey: string,
    seq: number
  ): Promise<void> {
    try {
      await this.deps.enqueueMarkRead({ userId, scopeType, scopeId, streamKey, seq });
    } catch (err) {
      // Mốc đọc đã commit — mục hộp thư sẽ tự đọc khi người dùng mở nó; không làm hỏng request.
      logger.warn("[read-marker] Không xếp được mark-read-by-stream", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
