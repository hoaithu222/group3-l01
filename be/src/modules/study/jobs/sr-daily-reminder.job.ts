import { defineCron, registerJob } from "../../../infrastructure/queue";
import { logger } from "../../../infrastructure/logger";
import { registerStudyNotificationTypes } from "../notifications/study.notification-types";
import { getStudyContainer } from "../study.container";

registerStudyNotificationTypes();

/**
 * `sr.daily-reminder` (queue `cron`, mỗi giờ) — nhắc "N thẻ cần ôn hôm nay" cho người có giờ địa phương = `LIMITS.sr.reminderLocalHour`.
 * MỘT job tick TĨNH (không scheduler theo múi giờ/người: `syncCronSchedulers()` xoá scheduler ngoài registry). Idempotent theo
 * `Notification.dedupeKey = sr-due:<userId>:<localDate>`.
 */
registerJob("cron", "sr.daily-reminder", async () => {
  const notified = await getStudyContainer().srReminder.run();
  if (notified > 0) logger.info("[sr.daily-reminder] Đã nhắc ôn tập", { notified });
});

defineCron({
  schedulerId: "sr.daily-reminder",
  queue: "cron",
  jobName: "sr.daily-reminder",
  pattern: "0 * * * *",
  opts: { attempts: 1 },
});
