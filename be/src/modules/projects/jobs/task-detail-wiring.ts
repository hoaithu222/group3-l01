import { withTransaction } from "../../../infrastructure/database";
import { notify } from "../../notifications/public";
import { getProjectsContainer } from "../projects.container";
import { RescheduleNotificationHandler } from "../services/reschedule-notification.handler";
import { BullReminderQueue } from "../services/task-due-reminder.queue";
import { TaskDueReminderService } from "../services/task-due-reminder";
import { TaskNotificationHandler, type NotifyFn } from "../services/task-notification.handler";

/** `notify()` cần transaction do NƠI GỌI mở (ghi Notification + Recipient + Outbox nguyên tử) — p0-06 §5.3. */
const notifyInTx: NotifyFn = async (input) => {
  await withTransaction((tx) => notify(tx, input));
};

let handler: TaskNotificationHandler | null = null;
let reminder: TaskDueReminderService | null = null;
let rescheduleHandler: RescheduleNotificationHandler | null = null;

/**
 * Composition root của các sink/job p3-03 (tiến trình worker không import `projects.routes.ts` nên dùng singleton container
 * lười — cùng mẫu `board-rebalance-column.job.ts`). File job chỉ gọi hai hàm này.
 */
export function getTaskNotificationHandler(): TaskNotificationHandler {
  if (!handler) {
    const c = getProjectsContainer();
    handler = new TaskNotificationHandler({ tasks: c.tasks, comments: c.comments, directory: c.directory, notify: notifyInTx, watchers: c.watchers });
  }
  return handler;
}

export function getTaskDueReminderService(): TaskDueReminderService {
  if (!reminder) {
    const c = getProjectsContainer();
    reminder = new TaskDueReminderService({ tasks: c.tasks, directory: c.directory, queue: new BullReminderQueue(), notify: notifyInTx, watchers: c.watchers });
  }
  return reminder;
}

/** (p4-04) Sink thông báo dời lịch — cùng `notifyInTx` và singleton container như hai sink p3-03. */
export function getRescheduleNotificationHandler(): RescheduleNotificationHandler {
  if (!rescheduleHandler) {
    const c = getProjectsContainer();
    rescheduleHandler = new RescheduleNotificationHandler({ tasks: c.tasks, directory: c.directory, notify: notifyInTx });
  }
  return rescheduleHandler;
}
