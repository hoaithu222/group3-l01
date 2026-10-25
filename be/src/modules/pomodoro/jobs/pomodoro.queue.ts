import { enqueue, toSafeJobId } from "../../../infrastructure/queue";
import { logger } from "../../../infrastructure/logger";
import { POMODORO_JOB, POMODORO_QUEUE } from "../entities/pomodoro.interface";
import type { IPomodoroJobs } from "../services/pomodoro.ports";

/** Thời gian chờ tối đa khi xếp job — `queueConnection` treo vô hạn nếu Redis mất (xem `outbox.writer.ts`). */
const ENQUEUE_TIMEOUT_MS = 1000;

/** Việc nền không bắt buộc bền (cron `pomodoro.reconcile` quét bù) — cùng khuôn `QueueCallJobs`. */
export class QueuePomodoroJobs implements IPomodoroJobs {
  async scheduleHostSync(sessionId: string, delayMs: number): Promise<void> {
    try {
      await Promise.race([
        enqueue(POMODORO_QUEUE, POMODORO_JOB.hostSync, { sessionId }, {
          // BullMQ giữ job đã xong nên `jobId` cố định chặn mọi lần xếp sau → gắn mốc thời gian; `deduplication` mới là chỗ gộp.
          jobId: toSafeJobId(`${POMODORO_JOB.hostSync}:pomo:${sessionId}:${Date.now()}`),
          delay: delayMs,
          deduplication: { id: `${POMODORO_JOB.hostSync}:${sessionId}`, ttl: Math.max(delayMs, 1000) },
        }),
        new Promise<never>((_resolve, reject) => setTimeout(() => reject(new Error("enqueue pomodoro.host-sync quá hạn")), ENQUEUE_TIMEOUT_MS).unref()),
      ]);
    } catch (err) {
      logger.warn("[pomodoro] Không xếp được pomodoro.host-sync", { sessionId, error: err instanceof Error ? err.message : String(err) });
    }
  }
}
