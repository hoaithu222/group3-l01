import { enqueue, getQueue, toSafeJobId } from "../../infrastructure/queue";
import { logger } from "../../infrastructure/logger";

export const LIVEKIT_EVENT_QUEUE = "calls" as const;
export const LIVEKIT_EVENT_JOB = "livekit.event";
export const LIVEKIT_EVENT_ATTEMPTS = 5;
/** `queueConnection` (ioredis, `maxRetriesPerRequest: null`) KHÔNG bao giờ tự reject khi Redis mất → phải chặn trần thời gian. */
export const LIVEKIT_ENQUEUE_TIMEOUT_MS = 2000;

/**
 * jobId `livekit.event:<event.id>` có 1 dấu `:` → BullMQ ném "Custom Id cannot contain :" (chỉ chấp nhận 0 hoặc đúng
 * 2 dấu). Đổi `:` → `_` bằng `toSafeJobId` — thiếu bước này mọi enqueue lỗi (và bị nuốt để trả 200) ⇒ không sự kiện nào
 * được xử lý ở production. `WebhookEvent.eventId` vẫn unique nên id job vẫn duy nhất theo sự kiện.
 */
export function livekitEventJobId(eventId: string): string {
  return toSafeJobId(`${LIVEKIT_EVENT_JOB}:${eventId}`);
}

export interface LiveKitEventJobData {
  webhookEventId: string;
}

export interface ILiveKitEventQueue {
  /** Xếp job xử lý sự kiện; KHÔNG BAO GIỜ ném (lỗi/timeout → `false`, sự kiện ở lại `RECEIVED` cho `webhook.sweep`). */
  enqueue(webhookEventId: string, eventId: string): Promise<boolean>;
  /** Như `enqueue` nhưng xoá trước job cũ đã `completed`/`failed` cùng id (BullMQ bỏ qua `add` trùng id còn lưu lại). */
  requeue(webhookEventId: string, eventId: string): Promise<boolean>;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`Quá ${ms} ms khi thao tác hàng đợi`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export class BullLiveKitEventQueue implements ILiveKitEventQueue {
  private async add(webhookEventId: string, eventId: string): Promise<void> {
    const data: LiveKitEventJobData = { webhookEventId };
    await enqueue(LIVEKIT_EVENT_QUEUE, LIVEKIT_EVENT_JOB, data, {
      jobId: livekitEventJobId(eventId),
      attempts: LIVEKIT_EVENT_ATTEMPTS,
      backoff: { type: "exponential", delay: 2000 },
    });
  }

  async enqueue(webhookEventId: string, eventId: string): Promise<boolean> {
    try {
      await withTimeout(this.add(webhookEventId, eventId), LIVEKIT_ENQUEUE_TIMEOUT_MS);
      return true;
    } catch (err) {
      logger.warn("[livekit.event] Không xếp được job — sự kiện giữ RECEIVED, webhook.sweep sẽ đẩy lại", {
        eventId,
        error: err instanceof Error ? err.message : String(err),
      });
      return false;
    }
  }

  async requeue(webhookEventId: string, eventId: string): Promise<boolean> {
    try {
      await withTimeout(
        (async () => {
          const job = await getQueue(LIVEKIT_EVENT_QUEUE).getJob(livekitEventJobId(eventId));
          if (job) {
            const state = await job.getState();
            if (state === "completed" || state === "failed") await job.remove();
          }
          await this.add(webhookEventId, eventId);
        })(),
        LIVEKIT_ENQUEUE_TIMEOUT_MS
      );
      return true;
    } catch (err) {
      logger.warn("[livekit.event] Không đẩy lại được job", {
        eventId,
        error: err instanceof Error ? err.message : String(err),
      });
      return false;
    }
  }
}
