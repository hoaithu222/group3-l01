import { LIMITS } from "../../../core/constants/limits";
import { redis } from "../../../infrastructure/redis";
import { enqueue } from "../../../infrastructure/queue";
import { logger } from "../../../infrastructure/logger";
import type {
  CoalescedPushJobData,
  FanoutReason,
  MessagePushJobData,
  PushTarget,
} from "../entities/message-notification.types";
import { maxReason } from "./fanout-reasons";

/** BullMQ chỉ nhận `jobId` tuỳ biến có 0 hoặc đúng 2 dấu ":" — đổi hết ":" thành "_" (xem memory be-outbox-dedupekey-colons). */
export function safeJobId(raw: string): string {
  return raw.replace(/:/g, "_");
}

/** Cổng Redis/queue tối thiểu — inject fake trong test (đồng hồ + Redis giả, NT-08). */
export interface DispatchIo {
  isRedisOpen(): boolean;
  setNx(key: string, value: string, ttlSeconds: number): Promise<boolean>;
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: object | string, ttlSeconds: number): Promise<void>;
  incr(key: string): Promise<number | null>;
  expire(key: string, ttlSeconds: number): Promise<void>;
  enqueue(name: string, data: object, opts: { jobId: string; delay?: number }): Promise<void>;
}

export const defaultDispatchIo: DispatchIo = {
  isRedisOpen: () => !!redis.getClient()?.isReady,
  setNx: (key, value, ttl) => redis.setNx(key, value, ttl),
  get: <T>(key: string) => redis.get<T>(key),
  set: (key, value, ttl) => redis.set(key, value, ttl),
  incr: (key) => redis.incr(key),
  expire: (key, ttl) => redis.expire(key, ttl),
  enqueue: (name, data, opts) => enqueue("push", name, data, opts),
};

export type DispatchResult = "immediate" | "coalesced" | "duplicate";

export interface PendingInfo {
  messageId: string;
  seq: number;
  reason: FanoutReason;
  authorId: string;
}

const PENDING_TTL_SECONDS = 30;
const DEDUPE_TTL_SECONDS = 120;

export function pendingKeys(userId: string, scopeKey: string): { count: string; last: string; window: string } {
  return {
    count: `push:pending:${userId}:${scopeKey}`,
    last: `push:pending-last:${userId}:${scopeKey}`,
    window: `push:win:${userId}:${scopeKey}`,
  };
}

/**
 * `PushDispatchService.enqueue` (be.md §5.6) — cửa sổ gộp `pushBatchWindowSeconds` (10 s) theo `(người nhận, scope)`:
 *   • tin ĐẦU trong cửa sổ → `push.send` NGAY (1-1 phản hồi nhanh, không trễ);
 *   • tin kế tiếp → tăng bộ đếm chờ + đảm bảo đúng 1 job `push.send-coalesced` cuối cửa sổ (jobId theo
 *     `windowStart` nên tạo một lần) — gửi "N tin nhắn mới" (NT-08).
 * Idempotent theo `(messageId, userId)` (khoá `push:dedupe:*`) để fan-out chạy lại không đếm trùng.
 * Redis không khả dụng → gửi ngay (an toàn hơn im lặng, giống `DeliveryPolicy`).
 */
export class PushDispatchService {
  constructor(
    private readonly io: DispatchIo = defaultDispatchIo,
    private readonly windowSeconds: number = LIMITS.notification.pushBatchWindowSeconds,
    private readonly now: () => number = () => Date.now()
  ) {}

  async enqueueMany(targets: PushTarget[]): Promise<void> {
    for (const target of targets) {
      try {
        await this.enqueueOne(target);
      } catch (err) {
        // Một người lỗi không được kéo cả lô (fan-out đã ghi mục hộp thư) — log để điều tra.
        logger.error("[push-dispatch] enqueue thất bại", {
          userId: target.userId,
          messageId: target.messageId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  async enqueueOne(t: PushTarget): Promise<DispatchResult> {
    if (!this.io.isRedisOpen()) {
      await this.sendNow(t);
      return "immediate";
    }

    const fresh = await this.io.setNx(`push:dedupe:${t.messageId}:${t.userId}`, "1", DEDUPE_TTL_SECONDS);
    if (!fresh) return "duplicate";

    const keys = pendingKeys(t.userId, t.scopeKey);
    const nowMs = this.now();
    const openedWindow = await this.io.setNx(keys.window, String(nowMs), this.windowSeconds);
    if (openedWindow) {
      await this.sendNow(t);
      return "immediate";
    }

    await this.io.incr(keys.count);
    await this.io.expire(keys.count, PENDING_TTL_SECONDS);
    const prev = await this.io.get<PendingInfo>(keys.last);
    const last: PendingInfo = {
      messageId: t.messageId,
      seq: t.seq,
      authorId: t.authorId,
      reason: prev ? maxReason(prev.reason, t.reason) : t.reason,
    };
    await this.io.set(keys.last, last, PENDING_TTL_SECONDS);

    const windowStart = Number(await this.io.get<number | string>(keys.window)) || nowMs;
    const delay = Math.max(0, windowStart + this.windowSeconds * 1000 - nowMs);
    const job: CoalescedPushJobData = {
      kind: "message-coalesced",
      userId: t.userId,
      scopeType: t.scopeType,
      scopeId: t.scopeId,
      threadId: t.threadId,
      scopeKey: t.scopeKey,
      windowStart,
    };
    await this.io.enqueue("push.send-coalesced", job, {
      jobId: safeJobId(`push.send-coalesced:user:${t.userId}:scope:${t.scopeKey}:win:${windowStart}`),
      delay,
    });
    return "coalesced";
  }

  private async sendNow(t: PushTarget): Promise<void> {
    const job: MessagePushJobData = { kind: "message", ...t };
    await this.io.enqueue("push.send", job, {
      jobId: safeJobId(`push.send:message:${t.messageId}:user:${t.userId}`),
    });
  }
}
