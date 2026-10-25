import { registerJob } from "../../../infrastructure/queue";
import { logger } from "../../../infrastructure/logger";
import { registerStudyNotificationTypes } from "../notifications/study.notification-types";
import { getStudyContainer } from "../study.container";

registerStudyNotificationTypes();

/**
 * `mock-attempt.expire` (queue `cron`) — nộp hộ lượt thi khi tới hạn (`expiresAt + LIMITS.mock.expireGraceSec`), ST-05 phần server.
 * Dòng outbox `availableAt` do `MockAttemptService.create` ghi (bền qua khởi động lại); nộp tay thì dòng đó bị xoá, nếu đã kịp
 * dispatch thì processor tự no-op nhờ CAS `IN_PROGRESS` (không tạo `quiz.scored` thứ hai). Idempotent, retry an toàn.
 */
registerJob("cron", "mock-attempt.expire", async (job) => {
  const { attemptId } = job.data as { attemptId?: string };
  if (!attemptId) {
    logger.warn("[mock-attempt.expire] payload thiếu attemptId, bỏ qua", { id: job.id });
    return;
  }
  const result = await getStudyContainer().mock.expire(attemptId);
  if (result === "EXPIRED") logger.info("[mock-attempt.expire] Đã tự nộp bài thi hết giờ", { attemptId });
});
