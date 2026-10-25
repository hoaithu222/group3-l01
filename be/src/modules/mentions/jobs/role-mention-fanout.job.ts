import { registerJob } from "../../../infrastructure/queue";
import { logger } from "../../../infrastructure/logger";
import { RoleMentionFanoutService, registerRoleMentionNotificationType } from "../role-mention-fanout.service";

/**
 * `fanout.message-role` (queue `notifications`, p3-04 be.md §5.7/§7) — MỘT job/tin có mention vai trò, jobId
 * `fanout.message-role:message:<id>` (dedupeKey của dòng outbox riêng do `message.service.ts#send()` ghi cùng transaction;
 * sửa tin thêm vai trò MỚI dùng thêm hậu tố `:v<version>`). Payload: `{ messageId }`. Retry theo mặc định queue;
 * chạy lại an toàn (bỏ người đã có mục hộp thư cho tin này). Job file tự `new` DI riêng (tiến trình worker không import `router.ts`).
 */
registerRoleMentionNotificationType();
const service = new RoleMentionFanoutService();

registerJob("notifications", "fanout.message-role", async (job) => {
  const { messageId } = job.data as { messageId: string };
  const stats = await service.fanout(messageId);
  logger.debug("[fanout.message-role] Hoàn tất", { messageId, ...stats });
});
