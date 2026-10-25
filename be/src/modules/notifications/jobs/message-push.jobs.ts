import { registerJob } from "../../../infrastructure/queue";
import { logger } from "../../../infrastructure/logger";
import { getMessagePushService } from "../services/notification-wiring";
import type { CoalescedPushJobData } from "../entities/message-notification.types";

/**
 * `push.send-coalesced` (queue `push`, p1-07 be.md §5.6) — job trễ CUỐI cửa sổ gộp 10 s, tạo một lần nhờ jobId
 * `push.send-coalesced:user:<u>:scope:<scopeKey>:win:<start>`. Đọc-xoá bộ đếm chờ, kiểm lại quyền/chưa đọc/mute
 * rồi gửi "N tin nhắn mới". `push.send` cho tin nhắn (`kind:"message"`) nằm ở `push.jobs.ts` (cùng processor với p0-06).
 */
registerJob("push", "push.send-coalesced", async (job) => {
  const data = job.data as CoalescedPushJobData;
  const outcome = await getMessagePushService().sendCoalesced(data);
  logger.debug("[push.send-coalesced] Hoàn tất", { userId: data.userId, scopeKey: data.scopeKey, outcome });
});
