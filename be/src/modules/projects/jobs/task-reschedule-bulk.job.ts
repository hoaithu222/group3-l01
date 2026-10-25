import { z } from "zod";
import { defineCron, registerJob } from "../../../infrastructure/queue";
import { logger } from "../../../infrastructure/logger";
import { objectIdSchema } from "../../../shared/dto/common-schemas";
import { RESCHEDULE_BULK_JOB, RESCHEDULE_BULK_QUEUE } from "../events/project-events";
import { getProjectsContainer } from "../projects.container";

const payloadSchema = z.object({ batchId: objectIdSchema });

/**
 * `reports/task.reschedule-bulk` (p4-04 be.md §5.6): áp lô dời lịch theo lượt 200 thẻ, idempotent theo `cursor` (chạy lại tiếp từ
 * lượt chưa xong, không áp đôi). Lỗi hệ thống → BullMQ retry (3 lần, backoff mũ); hết lượt → lô `FAILED`, nhả `activeKey`, vẫn báo
 * người yêu cầu. Payload sai định dạng → bỏ (không retry vô ích).
 */
registerJob(RESCHEDULE_BULK_QUEUE, RESCHEDULE_BULK_JOB, async (job) => {
  const parsed = payloadSchema.safeParse(job.data);
  if (!parsed.success) {
    logger.warn("[task.reschedule-bulk] payload không hợp lệ, bỏ qua", { id: job.id });
    return;
  }
  const processor = getProjectsContainer().rescheduleBatchProcessor;
  const { batchId } = parsed.data;
  try {
    const outcome = await processor.process(batchId);
    logger.info("[task.reschedule-bulk] xong", { batchId, outcome });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const attempts = job.opts?.attempts ?? 1;
    // `attemptsMade` = số lần đã THẤT BẠI trước lần chạy này → đây là lần cuối khi `attemptsMade + 1 >= attempts`.
    if ((job.attemptsMade ?? 0) + 1 >= attempts) await processor.fail(batchId, message);
    throw err;
  }
});

/**
 * `cron/reschedule-batch.sweep` (p4-04 be.md §5.6, mỗi 10 phút): lô `QUEUED`/`RUNNING` quá `LIMITS.task.rescheduleBatchStaleMinutes` (worker chết hẳn,
 * job mất khỏi hàng đợi) → `FAILED` + nhả `activeKey` để không chặn mọi lệnh dời lịch của bảng. Lịch khai TĨNH bằng `defineCron` (KHÔNG scheduler theo
 * thực thể — `syncCronSchedulers()` xoá scheduler không có trong registry tĩnh); idempotent nên `attempts: 1`.
 */
registerJob("cron", "reschedule-batch.sweep", async () => {
  const summary = await getProjectsContainer().rescheduleBatchSweeper.sweep();
  if (summary.scanned > 0) logger.info("[reschedule-batch.sweep] xong", { ...summary });
});

defineCron({
  schedulerId: "reschedule-batch.sweep",
  queue: "cron",
  jobName: "reschedule-batch.sweep",
  pattern: "*/10 * * * *",
  opts: { attempts: 1 },
});
