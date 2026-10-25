import { logger } from "../../../infrastructure/logger";
import { registerJob } from "../../../infrastructure/queue";
import { registerTaskEventSink } from "../events/task-event-sinks";
import { registerTaskNotificationTypes } from "../services/task-notification.types";
import { DUE_REMINDER_JOB, DUE_REMINDER_QUEUE } from "../services/task-due-reminder.queue";
import type { DueReminderJobData } from "../services/task-due-reminder";
import { getTaskDueReminderService } from "./task-detail-wiring";

registerTaskNotificationTypes();

/** Sink `task.events`: `task.due-changed` hẹn/đổi/huỷ job nhắc; `task.completed|deleted` huỷ; `task.reopened|restored` hẹn lại. */
registerTaskEventSink("p3-03.due-reminder", (payload) => getTaskDueReminderService().handleEvent(payload));

/**
 * `notifications/task.due-reminder` — chạy `LIMITS.task.dueReminderHoursBefore` giờ trước hạn (delayed job, jobId theo `dueVersion`).
 * Processor kiểm lại thẻ (còn sống, chưa hoàn thành, `dueVersion` khớp) nên job cũ lọt lưới không gửi nhầm.
 */
registerJob(DUE_REMINDER_QUEUE, DUE_REMINDER_JOB, async (job) => {
  const data = job.data as Partial<DueReminderJobData> | null;
  if (!data?.taskId || typeof data.dueVersion !== "number") {
    logger.warn("[task.due-reminder] payload không hợp lệ, bỏ qua", { id: job.id });
    return;
  }
  await getTaskDueReminderService().process({ taskId: data.taskId, dueVersion: data.dueVersion });
});
