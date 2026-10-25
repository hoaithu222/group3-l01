import { defineCron, registerJob } from "../../../infrastructure/queue";
import { logger } from "../../../infrastructure/logger";
import { getWebhooksContainer } from "../webhooks.container";

/** Sự kiện `RECEIVED` quá ngưỡng này coi là job xếp lỗi/mất (be.md §5.3 bước 4). */
export const WEBHOOK_SWEEP_AFTER_MS = 60_000;
export const WEBHOOK_SWEEP_BATCH = 100;
export const WEBHOOK_RETENTION_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * `webhook.sweep` (queue `cron`, mỗi phút) — đẩy lại `WebhookEvent` LiveKit còn `RECEIVED` quá 60 s (lúc nhận, xếp job
 * lỗi/hết hạn vì Redis chậm) bằng CÙNG jobId → không xử lý trùng. `FAILED` KHÔNG đẩy lại ở đây: đã hết 5 lần thử của job.
 */
registerJob("cron", "webhook.sweep", async () => {
  const { repo, queue } = getWebhooksContainer();
  const stale = await repo.findStaleReceived("LIVEKIT", new Date(Date.now() - WEBHOOK_SWEEP_AFTER_MS), WEBHOOK_SWEEP_BATCH);
  let requeued = 0;
  for (const row of stale) {
    if (await queue.requeue(row.id, row.eventId)) requeued += 1;
  }
  if (stale.length > 0) logger.info("[webhook.sweep] Đã đẩy lại sự kiện RECEIVED quá hạn", { found: stale.length, requeued });
});

/** `webhook.prune` (03:00 hằng ngày) — xoá `PROCESSED`/`IGNORED` quá 30 ngày (payload chỉ để gỡ lỗi, không lưu vô hạn). */
registerJob("cron", "webhook.prune", async () => {
  const before = new Date(Date.now() - WEBHOOK_RETENTION_DAYS * DAY_MS);
  const deleted = await getWebhooksContainer().repo.deleteFinishedBefore("LIVEKIT", before);
  logger.info("[webhook.prune] Đã dọn WebhookEvent cũ", { deleted });
});

defineCron({ schedulerId: "webhook.sweep", queue: "cron", jobName: "webhook.sweep", pattern: "* * * * *", opts: { attempts: 1 } });
defineCron({ schedulerId: "webhook.prune", queue: "cron", jobName: "webhook.prune", pattern: "0 3 * * *", opts: { attempts: 1 } });
