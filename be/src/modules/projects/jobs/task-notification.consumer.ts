import { registerTaskEventSink } from "../events/task-event-sinks";
import { registerTaskNotificationTypes } from "../services/task-notification.types";
import { getTaskNotificationHandler } from "./task-detail-wiring";

registerTaskNotificationTypes();

/**
 * Sink `task.events` của p3-03: `task.assigned`, `task.comment-created`, `task.comment-updated` → `notify()` (p0-06).
 * Không đăng ký queue/jobName mới — mọi sự kiện Task đi qua MỘT job `notifications/task.events` rồi tới các sink
 * (`task-events.consumer.ts`, mẫu `channel.events`). Sink idempotent theo `Notification.dedupeKey` dẫn xuất từ jobId.
 */
registerTaskEventSink("p3-03.notifications", (payload, jobId) => getTaskNotificationHandler().handle(payload, jobId));
