import { logger } from "../../../infrastructure/logger";
import { registerJob } from "../../../infrastructure/queue";
import { registerReviewNotificationTypes } from "../services/review/review-notification.types";
import { REVIEW_EVENT_JOB, REVIEW_EVENT_QUEUE, REVIEW_REMINDER_JOB, REVIEW_REMINDER_QUEUE, parseReviewEvent } from "../services/review/review-events";
import type { ReviewReminderJobData } from "../services/review/review-reminders";
import { getReviewNotificationHandler } from "./review-wiring";

registerReviewNotificationTypes();

/**
 * `notifications/review.events` — điểm nhận DUY NHẤT của outbox `review.assigned|round-closed|cancelled|shortage` (p4-05 be.md §7; mỗi cặp
 * queue/jobName chỉ có MỘT processor): thông báo `REVIEW_*` + hẹn nhắc 24/72 giờ + realtime `task:review-updated`. Idempotent (retry 3 lần).
 */
registerJob(REVIEW_EVENT_QUEUE, REVIEW_EVENT_JOB, async (job) => {
  const payload = parseReviewEvent(job.data);
  if (!payload) {
    logger.warn("[review.events] payload không hợp lệ, bỏ qua", { id: job.id });
    return;
  }
  await getReviewNotificationHandler().handle(payload, String(job.id ?? ""));
});

/** `notifications/review.reminder` — job hẹn giờ theo review (`review.reminder:review:<id>:h<24|72>`); processor kiểm lại review còn PENDING. */
registerJob(REVIEW_REMINDER_QUEUE, REVIEW_REMINDER_JOB, async (job) => {
  const data = job.data as Partial<ReviewReminderJobData> | null;
  if (!data?.reviewId || typeof data.hours !== "number") {
    logger.warn("[review.reminder] payload không hợp lệ, bỏ qua", { id: job.id });
    return;
  }
  await getReviewNotificationHandler().remind({ reviewId: data.reviewId, hours: data.hours });
});
