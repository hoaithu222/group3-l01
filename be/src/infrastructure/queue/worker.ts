import { Worker, type Job } from "bullmq";
import { queueConnection } from "./queue.client";
import { env } from "../../core/config";
import { logger } from "../logger";
import { queueJobsTotal } from "../metrics";
import { getErrorTracker } from "../error-tracker";
import type { QueueName } from "./queues";

type Processor = (job: Job) => Promise<unknown>;
const processors = new Map<QueueName, Map<string, Processor>>();

/** Module đăng ký processor cho `queue/jobName` lúc khởi tạo worker (trước `startWorkers()`). */
export function registerJob(queue: QueueName, jobName: string, fn: Processor): void {
  if (!processors.has(queue)) processors.set(queue, new Map());
  processors.get(queue)!.set(jobName, fn);
}

const concurrency: Partial<Record<QueueName, number>> = {
  notifications: env.WORKER_CONCURRENCY_NOTIFICATIONS,
  media: env.WORKER_CONCURRENCY_MEDIA,
  calls: env.WORKER_CONCURRENCY_CALLS,
  push: env.WORKER_CONCURRENCY_PUSH,
};

/** Khởi động 1 Worker cho mỗi queue đã có processor đăng ký. Gọi 1 lần trong `src/worker.ts`/`server.ts`. */
export function startWorkers(): Worker[] {
  return [...processors.entries()].map(([queue, map]) =>
    new Worker(
      queue,
      async (job) => {
        const fn = map.get(job.name);
        if (!fn) throw new Error(`Không có processor cho ${queue}/${job.name}`);
        return fn(job);
      },
      {
        connection: queueConnection,
        prefix: env.QUEUE_PREFIX,
        concurrency: concurrency[queue] ?? env.WORKER_CONCURRENCY_DEFAULT,
      }
    )
      .on("completed", () => queueJobsTotal.inc({ queue, status: "completed" }))
      .on("failed", (job, err) => {
        queueJobsTotal.inc({ queue, status: "failed" });
        logger.error("[queue] job failed", { queue, job: job?.name, id: job?.id, err: err.message });
        // p0-11 — CHỈ lỗi cuối cùng (hết số lần thử) mới báo error tracker: retry tạm thời (backoff) là bình thường, báo hết sẽ ngập Sentry.
        if (!job || job.attemptsMade >= (job.opts.attempts ?? 1)) {
          getErrorTracker().captureException(err, { queue, job: job?.name, jobId: job?.id, attemptsMade: job?.attemptsMade });
        }
      })
  );
}

/**
 * Đóng toàn bộ Worker đã khởi động — đợi job đang chạy hoàn tất, tối đa
 * `graceMs` (mặc định `WORKER_SHUTDOWN_GRACE_MS`); hết hạn mà chưa xong thì
 * force-close (`close(true)`, ngắt job đang chạy) thay vì treo graceful
 * shutdown vô thời hạn. Gọi trong `server.ts`/`worker.ts` SAU `stopOutboxRelay()`.
 */
export async function closeWorkers(
  workers: Worker[],
  graceMs: number = env.WORKER_SHUTDOWN_GRACE_MS
): Promise<void> {
  let finished = false;
  const closeAll = Promise.all(workers.map((w) => w.close())).then(() => {
    finished = true;
  });
  const timeout = new Promise<void>((resolve) => setTimeout(resolve, graceMs));

  await Promise.race([closeAll, timeout]);

  if (!finished) {
    logger.warn("[queue] Worker chưa đóng xong sau WORKER_SHUTDOWN_GRACE_MS, force-close", {
      graceMs,
    });
    await Promise.all(workers.map((w) => w.close(true).catch(() => undefined)));
  }
}
