import type { Prisma } from "@prisma/client";
import { queueConnection } from "../queue.client";
import { env } from "../../../core/config";
import { logger } from "../../logger";
import { markForSignal } from "./tx-signals";
import type { OutboxEventInput } from "./outbox.types";

/** Kênh Redis Pub/Sub báo "có event mới" cho `outbox.relay` — dùng ioredis riêng (không phải client `redis`). */
export const OUTBOX_SIGNAL_CHANNEL = `${env.REDIS_KEY_PREFIX}outbox:signal`;

let publisher: ReturnType<typeof queueConnection.duplicate> | null = null;
function getPublisher() {
  if (!publisher) {
    publisher = queueConnection.duplicate();
    publisher.on("error", (err) => {
      logger.warn("[outbox] publisher Redis lỗi", { error: err.message });
    });
  }
  return publisher;
}

/**
 * Ghi 1 `OutboxEvent` bên trong transaction Prisma (`tx`) — dùng cho mọi
 * side-effect BẮT BUỘC bền (fan-out thông báo, push, job hẹn giờ theo thực
 * thể, cập nhật số liệu phi chuẩn hoá, thu hồi quyền dự phòng). KHÔNG dùng
 * cho typing/presence/emit socket thuần thông tin (mất cũng không sao).
 */
export const outbox = {
  async add(tx: Prisma.TransactionClient, e: OutboxEventInput): Promise<void> {
    await tx.outboxEvent.create({
      data: {
        type: e.type,
        aggregateType: e.aggregateType,
        aggregateId: e.aggregateId,
        queue: e.queue,
        jobName: e.jobName,
        dedupeKey: e.dedupeKey,
        delayMs: e.delayMs,
        availableAt: e.availableAt ?? new Date(),
        payload: { schemaVersion: 1, ...e.payload } as Prisma.InputJsonValue,
      },
    });
    markForSignal(tx);
  },
};

/** Chặn trần thời gian chờ publish — không để 1 request HTTP treo vô hạn vì Redis mất kết nối. */
const SIGNAL_TIMEOUT_MS = 1000;

/**
 * PUBLISH tín hiệu "có event mới" lên Redis — `outbox.relay` lắng kênh này
 * để xử lý ngay thay vì chờ `OUTBOX_POLL_MS`. Gọi SAU khi transaction ghi
 * outbox đã commit (xem `withTransaction`, TRÊN đường xử lý request) —
 * publish lỗi hoặc quá chậm chỉ log warn, relay vẫn tự khôi phục nhờ fallback
 * poll + scheduler `outbox.relay` mỗi 10s.
 *
 * ⛔ `queueConnection` (ioredis) cấu hình `maxRetriesPerRequest: null` (bắt
 * buộc cho BullMQ) — nghĩa là lệnh KHÔNG BAO GIỜ tự reject khi Redis mất kết
 * nối, nó xếp hàng chờ reconnect vô thời hạn. Không có `Promise.race` timeout
 * ở đây thì `await outboxSignal()` (gọi đồng bộ trong `withTransaction`) treo
 * request mãi mãi mỗi khi Redis down — `try/catch` một mình không đủ vì
 * không có gì để `catch`.
 */
export async function outboxSignal(): Promise<void> {
  try {
    await Promise.race([
      getPublisher().publish(OUTBOX_SIGNAL_CHANNEL, "1"),
      new Promise<never>((_resolve, reject) => {
        setTimeout(() => reject(new Error(`Publish signal quá ${SIGNAL_TIMEOUT_MS}ms`)), SIGNAL_TIMEOUT_MS).unref();
      }),
    ]);
  } catch (err) {
    logger.warn("[outbox] publish signal thất bại hoặc quá hạn — vẫn có fallback poll", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
