import { registerJob } from "../../../infrastructure/queue";
import { logger } from "../../../infrastructure/logger";
import { srItemDeletedSchema } from "../../../shared/events/domain-events";
import { getStudyContainer } from "../study.container";

/**
 * `sr.item-deleted` (queue `cron`) — dọn `SrProgress` của mục đã xoá khỏi bộ (outbox do `StudyItemBulkService.save` ghi, dedupeKey
 * `sr.item-deleted:set:<id>:v<version>`). `deleteMany` theo `itemIds` nên chạy lại vô hại.
 */
registerJob("cron", "sr.item-deleted", async (job) => {
  const parsed = srItemDeletedSchema.safeParse(job.data);
  if (!parsed.success) {
    logger.warn("[sr.item-deleted] payload không hợp lệ, bỏ qua", { id: job.id });
    return;
  }
  const removed = await getStudyContainer().sr.purgeItems(parsed.data.itemIds);
  if (removed > 0) logger.info("[sr.item-deleted] Đã dọn tiến độ ôn của mục đã xoá", { setId: parsed.data.setId, removed });
});
