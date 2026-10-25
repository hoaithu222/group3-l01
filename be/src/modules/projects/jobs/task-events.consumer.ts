import { registerJob } from "../../../infrastructure/queue";
import { logger } from "../../../infrastructure/logger";
import { dispatchTaskEvent } from "../events/task-event-sinks";
import { TASK_EVENT_JOB, TASK_EVENT_QUEUE, type TaskEventPayload } from "../events/project-events";

/**
 * `task.events` (queue `notifications`) — điểm nhận DUY NHẤT của outbox `task.created|assigned|due-changed|completed|
 * reopened` (mẫu `channel.events`): chuyển cho các sink đã đăng ký (p3-03 thông báo/nhắc hạn, p4-03 XP, p4-04 phụ thuộc,
 * p4-06 đóng góp, p6-06 kỹ năng). Phase 3 chưa có sink → ghi nhận rồi xong. `job.id` = `dedupeKey` outbox (đã qua
 * `toSafeJobId`) nên sink dùng `payload` + `taskId`/`completionCount` để idempotent, không dựa vào `job.id`.
 */
registerJob(TASK_EVENT_QUEUE, TASK_EVENT_JOB, async (job) => {
  const payload = job.data as TaskEventPayload;
  if (!payload?.event || !payload.taskId) {
    logger.warn("[task.events] payload không hợp lệ, bỏ qua", { id: job.id });
    return;
  }
  await dispatchTaskEvent(payload, String(job.id ?? ""));
});
