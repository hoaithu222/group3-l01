import { registerJob } from "./worker";
import { logger } from "../logger";
import { cancelJob } from "./delayed-jobs";
import type { QueueName } from "./queues";

/**
 * `job.cancel` (queue `cron`) — processor cho `OutboxEvent` `type: "job.cancel"`
 * (be.md §5.4): huỷ 1 job hẹn giờ theo thực thể mà không cần code nghiệp vụ
 * gọi BullMQ trực tiếp trong transaction HTTP. Idempotent: job không tồn tại
 * không phải lỗi — `cancelJob` tự bỏ qua êm.
 *
 * File riêng (side-effect, chỉ import qua `register-jobs.ts`) — tách khỏi
 * `delayed-jobs.ts` (hàm thuần, export lại qua `infrastructure/queue/index.ts`,
 * import ở rất nhiều nơi) để import barrel không vô tình đăng ký processor
 * trước khi `registerAllJobs()` chạy.
 */
registerJob("cron", "job.cancel", async (job) => {
  const { queue, jobId } = job.data as { queue: QueueName; jobId: string };
  await cancelJob(queue, jobId);
  logger.info("[job.cancel] Đã xử lý yêu cầu huỷ job", { queue, jobId });
});
