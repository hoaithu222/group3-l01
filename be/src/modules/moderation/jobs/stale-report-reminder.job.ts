import { withTransaction } from "../../../infrastructure/database";
import { defineCron, registerJob } from "../../../infrastructure/queue";
import { logger } from "../../../infrastructure/logger";
import { notify } from "../../notifications/public";
import { registerModerationNotificationTypes } from "../moderation.notification-types";
import { PrismaReportRepository } from "../repositories/report.repository.prisma";
import { PrismaModerationDirectory } from "../repositories/moderation-directory.repository.prisma";
import { StaleReportReminderService } from "../services/stale-report-reminder.service";

registerModerationNotificationTypes();

const service = new StaleReportReminderService(
  new PrismaReportRepository(),
  new PrismaModerationDirectory(),
  async (input) => {
    await withTransaction((tx) => notify(tx, input));
  }
);

/**
 * `reports.stale-reminder` (queue `cron`, be.md p1-08 §7) — nhắc báo cáo OPEN quá `LIMITS.report.staleReminderHours` (72 giờ). Lịch TĨNH (một
 * tick/ngày 09:00 theo `CRON_TZ`, KHÔNG scheduler theo từng báo cáo — `syncCronSchedulers` sẽ xoá scheduler không có trong `defineCron`). Nghiệp vụ ở
 * `StaleReportReminderService` (idempotent theo ngày).
 */
registerJob("cron", "reports.stale-reminder", async () => {
  const result = await service.run();
  if (result.staleGroups > 0) logger.info("[reports.stale-reminder] Đã nhắc báo cáo tồn đọng", { ...result });
});

defineCron({ schedulerId: "reports.stale-reminder", queue: "cron", jobName: "reports.stale-reminder", pattern: "0 9 * * *", opts: { attempts: 1 } });
