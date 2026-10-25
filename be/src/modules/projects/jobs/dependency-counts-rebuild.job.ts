import { defineCron, registerJob } from "../../../infrastructure/queue";
import { logger } from "../../../infrastructure/logger";
import { getProjectsContainer } from "../projects.container";

/**
 * `cron/dependency-counts.rebuild` (p4-04 be.md §7, 02:30 hằng đêm theo giờ Việt Nam) — đối soát `blockedByCount`/`blockingCount` với
 * cạnh thật. Lịch khai TĨNH bằng `defineCron` (KHÔNG tạo scheduler theo-thực-thể: `syncCronSchedulers()` xoá scheduler không có trong
 * registry tĩnh). Idempotent (đếm lại từ cạnh) nên retry = 1 là đủ.
 */
registerJob("cron", "dependency-counts.rebuild", async () => {
  const summary = await getProjectsContainer().countsRebuildService.rebuildAll();
  logger.info("[dependency-counts.rebuild] đã đối soát bộ đếm phụ thuộc", summary);
});

defineCron({
  schedulerId: "dependency-counts.rebuild",
  queue: "cron",
  jobName: "dependency-counts.rebuild",
  pattern: "30 2 * * *",
  tz: "Asia/Ho_Chi_Minh",
  opts: { attempts: 1 },
});
