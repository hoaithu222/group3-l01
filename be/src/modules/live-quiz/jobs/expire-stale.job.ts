import { defineCron, registerJob } from "../../../infrastructure/queue";
import { logger } from "../../../infrastructure/logger";
import { getLiveQuizContainer } from "../live-quiz.container";

/**
 * `live-quiz.expire-stale` (queue `cron`, mỗi 15 phút, p5-01 be.md §7) — đóng phiên treo (CANCELLED/`EXPIRED`) bằng CAS.
 * MỘT tick TĨNH trong registry `defineCron` (KHÔNG scheduler theo phiên: `syncCronSchedulers()` xoá scheduler ngoài registry).
 */
registerJob("cron", "live-quiz.expire-stale", async () => {
  const closed = await getLiveQuizContainer().service.expireStale();
  if (closed > 0) logger.info("[live-quiz.expire-stale] Đã đóng phiên treo", { closed });
});

defineCron({
  schedulerId: "live-quiz.expire-stale",
  queue: "cron",
  jobName: "live-quiz.expire-stale",
  pattern: "*/15 * * * *",
  opts: { attempts: 1 },
});
