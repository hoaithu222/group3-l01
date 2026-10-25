import { registerTaskEventSink } from "../events/task-event-sinks";
import { registerTaskNotificationTypes } from "../services/task-notification.types";
import { getRescheduleNotificationHandler } from "./task-detail-wiring";

registerTaskNotificationTypes();

/**
 * Sink `task.events` của p4-04: `task.rescheduled` → một `TASK_RESCHEDULED` mỗi người làm (gộp các thẻ của họ, trừ người thực hiện);
 * `task.reschedule-bulk.completed` → `TASK_RESCHEDULE_BATCH_DONE` cho người yêu cầu. Không đăng ký queue/jobName mới — cùng job
 * `notifications/task.events` như p3-03 (`task-events.consumer.ts`). Idempotent theo `Notification.dedupeKey`.
 */
registerTaskEventSink("p4-04.reschedule-notifications", (payload) => getRescheduleNotificationHandler().handle(payload));
