import { registerJob } from "../../../infrastructure/queue";
import { logger } from "../../../infrastructure/logger";
import { PrismaSavedMessageRepository } from "../repositories/saved-message.repository.prisma";

/**
 * `discovery.user-anonymized` (queue `reports`) — xoá danh sách tin đã lưu của tài khoản đã ẩn danh hoá (p1-04/p1-09). `UserAnonymizer` ghi một
 * dòng outbox RIÊNG cho từng module tiêu thụ (dedupeKey `discovery.user-anonymized:user:<id>`; job `notifications/user.anonymized` chung chưa có
 * processor và mỗi cặp queue/jobName chỉ có MỘT processor). Idempotent (`deleteMany`); CHỈ xoá `SavedMessage` của chính user — tin do user
 * viết vẫn giữ (D-02), bản lưu của người khác trỏ tới tin đó không đổi.
 */
registerJob("reports", "discovery.user-anonymized", async (job) => {
  const { userId } = job.data as { userId?: string };
  if (!userId) {
    logger.warn("[discovery.user-anonymized] payload thiếu userId, bỏ qua", { id: job.id });
    return;
  }
  const deleted = await new PrismaSavedMessageRepository().deleteAllByUser(userId);
  logger.info("[discovery.user-anonymized] Đã xoá tin đã lưu", { userId, deleted });
});
