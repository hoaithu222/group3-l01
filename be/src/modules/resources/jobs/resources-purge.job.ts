import { registerJob, defineCron } from "../../../infrastructure/queue";
import { logger } from "../../../infrastructure/logger";
import { getResourcesContainer } from "../resources.container";

/**
 * `resources.purge` (queue `cron`, 03:15 hằng ngày theo `CRON_TZ`) — xoá vĩnh viễn tệp/thư mục trong thùng rác quá
 * `trashRetentionDays`: xoá object storage + `AssetLink`, `Asset` → `DELETED`, giảm `Workspace.storageUsedBytes`,
 * outbox `resource.purged`, audit `resource.purge` (p3-01 be.md §7). Lô 200, tối đa 10 lô/lượt; mục lỗi ở lại thùng
 * rác và được thử lại lượt sau (idempotent: xoá object lặp vô hại, `deleteById` kiểm lại `deletedAt`).
 */
registerJob("cron", "resources.purge", async () => {
  const report = await getResourcesContainer().purge.runSweep();
  logger.info("[resources.purge] Hoàn tất", report);
});

defineCron({ schedulerId: "resources.purge", queue: "cron", jobName: "resources.purge", pattern: "15 3 * * *" });
