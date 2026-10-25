import { defineCron, registerJob } from "../../../infrastructure/queue";
import { logger } from "../../../infrastructure/logger";
import { LIMITS } from "../../../core/constants/limits";
import { PrismaNotificationRepository } from "../repositories";
import { NotificationService } from "../services/notification.service";

const service = new NotificationService(new PrismaNotificationRepository());

/**
 * `notifications.inbox-retention` (cron 04:00, queue `cron`, p1-07 be.md §5.8/§7) — xoá mục hộp thư ĐÃ ĐỌC hoặc
 * ĐÃ HUỶ quá `LIMITS.notification.inboxRetentionDays` (90) ngày và `Notification` không còn người nhận. Mục chưa
 * đọc được giữ lại. Không retry (`attempts: 1`) — lượt sau 24 h tự dọn tiếp.
 */
registerJob("cron", "notifications.inbox-retention", async () => {
  const cutoff = new Date(Date.now() - LIMITS.notification.inboxRetentionDays * 86_400_000);
  const result = await service.purgeExpired(cutoff);
  logger.info("[notifications.inbox-retention] Hoàn tất", { cutoff: cutoff.toISOString(), ...result });
});

defineCron({
  schedulerId: "notifications.inbox-retention",
  queue: "cron",
  jobName: "notifications.inbox-retention",
  pattern: "0 4 * * *",
  opts: { attempts: 1 },
});
