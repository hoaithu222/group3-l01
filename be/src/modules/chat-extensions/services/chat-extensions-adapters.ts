import { permissionService } from "../../../core/permission";
import { ScopeForbiddenError } from "../../../core/exceptions";
import type { AuthUser } from "../../../core/types/express";
import { ErrorCode, ErrorMessages } from "../../../core/utils/error.codes";
import { LIMITS } from "../../../core/constants/limits";
import { enqueue, toSafeJobId, type QueueName } from "../../../infrastructure/queue";
import { redis } from "../../../infrastructure/redis";
import { logger } from "../../../infrastructure/logger";
import { emitToRoom, emitToUsers } from "../../../infrastructure/socket/socket.emit";
import { createAssetLinkService } from "../../assets/public";
import { notify } from "../../notifications/public";
import type { PollEntity } from "../entities/chat-extensions.types";
import type { TxHandle } from "../repositories/tx";
import { CHAT_EXT_JOBS, type PollEmitPayload } from "./chat-extensions-events";
import { CHAT_EXT_NOTIFICATION_TYPES } from "./chat-extensions-notification-types";
import type { IJobEnqueuer } from "./chat-extensions-sweep.service";
import type { ChatPermissionKey, ChatPermissionScope, IChatEmitter, IChatNotifier, IChatPermissionGate, IEmitThrottle, IScheduledAssetPort } from "./chat-extensions-ports";

const ENQUEUE_TIMEOUT_MS = 1500;

/**
 * Cổng quyền MẶC ĐỊNH (chưa có p7-01): KHÁCH (GUEST) của nhóm không tạo khảo sát/tin hẹn giờ (bảng vai mặc định be.md §5.7: GUEST chỉ `MESSAGE_SEND`); MEMBER trở lên được (kể cả
 * `SCHEDULED_MESSAGE_CREATE`, mà p7-01 sẽ thêm cho MEMBER — đồng bộ chéo #8); hội thoại 1-1 (không có nhóm) chỉ cần quyền gửi đã kiểm ở nơi gọi. ĐIỂM NỐI p7-01 — xem `IChatPermissionGate`.
 */
export class DefaultChatPermissionGate implements IChatPermissionGate {
  async assert(user: AuthUser, _key: ChatPermissionKey, scope: ChatPermissionScope): Promise<void> {
    if (!scope.workspaceId) return;
    const access = await permissionService.resolve(user, { type: "WORKSPACE", id: scope.workspaceId });
    if (access.role === "GUEST") throw new ScopeForbiddenError(ErrorMessages[ErrorCode.PERM_001], ErrorCode.PERM_001);
  }
}

/** Phát qua `emitToRoom/emitToUsers` (`socket.emit.ts`) — lỗi chỉ log. */
export class SocketChatEmitter implements IChatEmitter {
  toRoom(room: string, event: string, payload: Record<string, unknown>): void {
    try {
      emitToRoom(room, event, payload);
    } catch (err) {
      logger.warn("[chat-extensions] Không phát được sự kiện tới room", { event, error: err instanceof Error ? err.message : String(err) });
    }
  }

  toUsers(userIds: string[], event: string, payload: Record<string, unknown>): void {
    try {
      emitToUsers(userIds, event, payload);
    } catch (err) {
      logger.warn("[chat-extensions] Không phát được sự kiện tới người dùng", { event, error: err instanceof Error ? err.message : String(err) });
    }
  }
}

/** Nhịp phát bằng Redis `SET NX EX` (`redis.setNx`) + job trễ `poll.emit` (jobId theo giây → gộp). `enqueue` bọc trần thời gian vì `queueConnection` treo vô hạn khi Redis mất. */
export class RedisEmitThrottle implements IEmitThrottle {
  async tryAcquire(pollId: string): Promise<boolean> {
    try {
      return await redis.setNx(`poll:emit:${pollId}`, "1", LIMITS.poll.emitThrottleSeconds);
    } catch {
      return false;
    }
  }

  async scheduleTrailing(poll: Pick<PollEntity, "id">): Promise<void> {
    const windowSeconds = LIMITS.poll.emitThrottleSeconds;
    const bucket = Math.floor(Date.now() / (windowSeconds * 1000)) + 1;
    const jobId = toSafeJobId(`${CHAT_EXT_JOBS.pollEmit.name}:poll:${poll.id}:${bucket}`);
    try {
      await Promise.race([
        enqueue(CHAT_EXT_JOBS.pollEmit.queue, CHAT_EXT_JOBS.pollEmit.name, { pollId: poll.id } satisfies PollEmitPayload, { jobId, delay: windowSeconds * 1000 }),
        new Promise<never>((_resolve, reject) => setTimeout(() => reject(new Error("enqueue poll.emit quá hạn")), ENQUEUE_TIMEOUT_MS).unref()),
      ]);
    } catch (err) {
      logger.warn("[chat-extensions] Không xếp được job poll.emit (bỏ lượt phát cuối cửa sổ)", { pollId: poll.id, error: err instanceof Error ? err.message : String(err) });
    }
  }
}

/** Gắn/gỡ `AssetLink(SCHEDULED_MESSAGE)` qua `AssetLinkService` (cổng công khai của `assets`) — scope `NONE`: chỉ chủ tệp đọc được cho tới khi tin phát ra (lúc đó `messages` gắn `MESSAGE`). */
export class PublicScheduledAssetPort implements IScheduledAssetPort {
  private readonly links = createAssetLinkService();

  attach(tx: TxHandle, input: { assetIds: string[]; scheduledMessageId: string; actorId: string }): Promise<void> {
    return this.links.attach(tx, { assetIds: input.assetIds, targetType: "SCHEDULED_MESSAGE", targetId: input.scheduledMessageId, scopeType: "NONE", actorId: input.actorId });
  }

  detach(tx: TxHandle, input: { scheduledMessageId: string; assetIds?: string[] }): Promise<void> {
    return this.links.detach(tx, { targetType: "SCHEDULED_MESSAGE", targetId: input.scheduledMessageId, ...(input.assetIds ? { assetIds: input.assetIds } : {}) });
  }
}

/** `notify()` TRONG transaction của nơi gọi; `scope: null` (loại `NONE`) vì phạm vi có thể đã đóng/mất quyền — thông báo chỉ mang id tham chiếu, không nội dung tin. */
export class NotifyChatNotifier implements IChatNotifier {
  async scheduledFailed(tx: TxHandle, input: { scheduledMessageId: string; authorId: string; reason: string }): Promise<void> {
    await notify(tx, {
      type: CHAT_EXT_NOTIFICATION_TYPES.SCHEDULED_FAILED,
      scope: null,
      source: { type: "ScheduledMessage", id: input.scheduledMessageId },
      refs: { scheduledMessageId: input.scheduledMessageId, reason: input.reason },
      recipients: [{ userId: input.authorId }],
      dedupeKey: `scheduled-message.failed:${input.scheduledMessageId}`,
    });
  }

  async reminder(tx: TxHandle, input: { reminderId: string; userId: string; messageId: string; scopeType: "CHANNEL" | "CONVERSATION"; scopeId: string; unavailable: boolean }): Promise<void> {
    await notify(tx, {
      type: CHAT_EXT_NOTIFICATION_TYPES.MESSAGE_REMINDER,
      scope: null,
      source: { type: "MessageReminder", id: input.reminderId },
      // Tin không còn khả dụng: KHÔNG kèm `messageId`/phạm vi (không lộ gì) — REMIND-01.
      refs: input.unavailable
        ? { reminderId: input.reminderId, unavailable: true }
        : { reminderId: input.reminderId, messageId: input.messageId, scopeType: input.scopeType, scopeId: input.scopeId },
      recipients: [{ userId: input.userId }],
      dedupeKey: `message-reminder:${input.reminderId}`,
    });
  }
}

/** Xếp lại job của cron quét bù: `jobId` qua `toSafeJobId` (chứa `:`), bọc trần thời gian vì `queueConnection` treo vô hạn khi Redis mất; lỗi chỉ log (lượt cron sau thử lại). */
export class QueueJobEnqueuer implements IJobEnqueuer {
  async enqueue(queue: string, name: string, payload: object, jobId: string): Promise<void> {
    try {
      await Promise.race([
        enqueue(queue as QueueName, name, payload, { jobId: toSafeJobId(jobId) }),
        new Promise<never>((_resolve, reject) => setTimeout(() => reject(new Error("enqueue quá hạn")), ENQUEUE_TIMEOUT_MS).unref()),
      ]);
    } catch (err) {
      logger.warn("[chat-extensions] Không xếp lại được job", { queue, name, jobId, error: err instanceof Error ? err.message : String(err) });
    }
  }
}
