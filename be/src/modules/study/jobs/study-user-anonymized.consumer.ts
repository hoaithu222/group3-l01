import { registerJob } from "../../../infrastructure/queue";
import { logger } from "../../../infrastructure/logger";
import { getStudyContainer } from "../study.container";

/**
 * `study.user-anonymized` (queue `cron`) — xoá dữ liệu học cá nhân của tài khoản đã ẩn danh hoá (`UserAnonymizer` ghi một dòng outbox
 * RIÊNG cho từng module tiêu thụ, dedupeKey `study.user-anonymized:user:<id>`; job `notifications/user.anonymized` chung chưa có processor
 * và chỉ có thể có MỘT). Idempotent (`deleteMany`).
 */
registerJob("cron", "study.user-anonymized", async (job) => {
  const { userId } = job.data as { userId?: string };
  if (!userId) {
    logger.warn("[study.user-anonymized] payload thiếu userId, bỏ qua", { id: job.id });
    return;
  }
  const counts = await getStudyContainer().userData.erase(userId);
  logger.info("[study.user-anonymized] Đã xoá dữ liệu học cá nhân", { userId, ...counts });
});
