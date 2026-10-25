import { getQueue, enqueue, type QueueName } from "./queues";

/**
 * BullMQ ném `"Custom Id cannot contain :"` cho `jobId` tuỳ biến có dấu `:` TRỪ đúng 3 đoạn (2 dấu `:`) — xem
 * ghi chú ở `outbox.relay.ts#toSafeJobId`. Relay tự thế `:` → `_` cho job đi qua outbox; job HẸN GIỜ TRỰC TIẾP
 * (`scheduleAt`/`rescheduleJob`/`cancelJob`/`enqueue` với `jobId` tự đặt) KHÔNG được thế tự động → dùng hàm này
 * cho MỌI `jobId` có ≥ 3 dấu `:` (vd `task.due-reminder:task:<id>:d<n>`, `guest.expire:membership:<id>:v<n>`,
 * `board.rebalance-column:board:<id>:<columnId>` của Phase 3) — CẢ khi tạo lẫn khi huỷ (`cancelJob`) để hai
 * phía ra cùng một id. Thêm mới (Phase 3), KHÔNG đổi hành vi của `enqueue`/`scheduleAt`/`cancelJob`.
 */
export function toSafeJobId(jobId: string): string {
  return jobId.replace(/:/g, "_");
}

/**
 * Thêm 1 job hẹn giờ chạy tại `runAt` — `delay = max(0, runAt − now)`.
 * ⚠️ KHÔNG gọi trực tiếp trong transaction Prisma xử lý request HTTP (be.md
 * §5.4) — ghi `OutboxEvent` với `delayMs` thay vào đó để bền qua restart;
 * dùng trực tiếp trong processor job (đã chạy ngoài transaction HTTP).
 */
export async function scheduleAt<T>(
  queue: QueueName,
  jobName: string,
  jobId: string,
  data: T,
  runAt: Date
): Promise<void> {
  const delay = Math.max(0, runAt.getTime() - Date.now());
  await enqueue(queue, jobName, data, { jobId, delay });
}

/** Huỷ 1 job đang chờ (`delayed`/`waiting`) — vô hại nếu job không tồn tại hoặc đã chạy/đã xong. */
export async function cancelJob(queue: QueueName, jobId: string): Promise<void> {
  const job = await getQueue(queue).getJob(jobId);
  if (!job) return;
  const state = await job.getState();
  if (state === "delayed" || state === "waiting") {
    await job.remove();
  }
}

/** Huỷ job cũ (nếu có) rồi thêm job mới — dùng khi thời điểm/dữ liệu hẹn giờ theo thực thể thay đổi. */
export async function rescheduleJob<T>(
  queue: QueueName,
  jobName: string,
  oldJobId: string,
  newJobId: string,
  data: T,
  runAt: Date
): Promise<void> {
  await cancelJob(queue, oldJobId);
  await scheduleAt(queue, jobName, newJobId, data, runAt);
}
