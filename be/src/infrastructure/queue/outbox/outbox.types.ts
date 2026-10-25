import type { QueueName } from "../queues";

/**
 * Input để ghi 1 `OutboxEvent` — map trực tiếp field Prisma model, TRỪ field
 * tự sinh (`id`, `status`, `attempts`, `lastError`, `lockedUntil`, `lockedBy`,
 * `createdAt`, `dispatchedAt`) mà `outbox.add()`/DB tự quản lý.
 */
export interface OutboxEventInput {
  /** Loại sự kiện, vd "call.ring-timeout.schedule", "user.session-invalidated". */
  type: string;
  /** Loại thực thể gốc, vd "Call", "User", "Message". */
  aggregateType: string;
  aggregateId: string;
  queue: QueueName;
  jobName: string;
  payload: Record<string, unknown>;
  /** Cũng dùng làm BullMQ `jobId` — PHẢI duy nhất (unique index) để idempotent. */
  dedupeKey: string;
  /** Delay tính từ lúc relay dispatch (không phải từ lúc tạo) khi job cần chạy trễ. */
  delayMs?: number;
  /** Mặc định `now()` — set tương lai để hoãn xử lý tới thời điểm cụ thể. */
  availableAt?: Date;
}
