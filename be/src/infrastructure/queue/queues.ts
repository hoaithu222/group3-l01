import { Queue, type JobsOptions } from "bullmq";
import { queueConnection } from "./queue.client";
import { env } from "../../core/config";

export const QUEUE_NAMES = [
  "notifications",
  "push",
  "media",
  "reports",
  "gamification",
  "integrations",
  "cron",
  "calls",
] as const;
export type QueueName = (typeof QUEUE_NAMES)[number];

export const DEFAULT_JOB_OPTIONS: JobsOptions = {
  attempts: 3,
  backoff: { type: "exponential", delay: 2000 },
  removeOnComplete: 1000,
  removeOnFail: 5000,
};

const queues = new Map<QueueName, Queue>();

/** Lazy-init Queue instance — dùng chung 1 instance cho cả process (api hoặc worker). */
export function getQueue(name: QueueName): Queue {
  let q = queues.get(name);
  if (!q) {
    q = new Queue(name, {
      connection: queueConnection,
      prefix: env.QUEUE_PREFIX,
      defaultJobOptions: DEFAULT_JOB_OPTIONS,
    });
    queues.set(name, q);
  }
  return q;
}

/** Thêm job — `jobId` bắt buộc để idempotent (BullMQ bỏ qua job trùng id đang chờ/hoạt động). */
export async function enqueue<T>(
  name: QueueName,
  jobName: string,
  data: T,
  opts: JobsOptions & { jobId: string }
): Promise<void> {
  await getQueue(name).add(jobName, data, opts);
}

/** Đóng toàn bộ queue đã khởi tạo — gọi khi graceful shutdown. */
export async function closeQueues(): Promise<void> {
  await Promise.all([...queues.values()].map((q) => q.close()));
}
