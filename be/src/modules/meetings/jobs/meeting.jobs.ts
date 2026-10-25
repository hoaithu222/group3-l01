import { defineCron, registerJob } from "../../../infrastructure/queue";
import { getMeetingsContainer } from "../meetings.container";
import type { MeetingEventPayload } from "../services/meeting-events";
import type { IcsSendJob } from "../services/meeting-jobs.port";
import type { MeetingRevocationInput } from "../services/meeting-lifecycle.service";
import { registerMeetingNotificationTypes } from "../services/meeting-notification-types";
import type { ReminderJobData } from "../services/meeting-reminder.service";
import { registerMeetingRevokeListener } from "./meeting-revoke-listener";
import "./meeting-room.jobs"; // (p2-05) phòng họp: processor queue `calls`, handler webhook `meet_*`, cron tự sửa
import "./recap-recording.jobs"; // (p2-06) biên bản & ghi hình: handler webhook `egress_*`, processor import/xoá/dừng/nhắc, cron retention + stuck-check

/**
 * Side-effect (import từ `register-jobs.ts`, chạy ở worker): processor queue `notifications` của lịch họp + cron dự phòng nhắc họp,
 * loại thông báo cuộc họp, listener thu hồi quyền. Toàn bộ nghiệp vụ nằm ở service (`getMeetingsContainer()`).
 */
registerMeetingNotificationTypes();
registerMeetingRevokeListener();

/** Sự kiện outbox `meeting.events` — created/updated/cancelled/deleted/attendees-changed/roles-changed/host-transferred. */
registerJob("notifications", "meeting.events", async (job) => {
  await getMeetingsContainer().events.handle(job.data as MeetingEventPayload);
});

/** Nhắc họp (delayed job theo `(cuộc họp, mốc phút, startAt)`); processor tự kiểm lại trạng thái. */
registerJob("notifications", "meeting.reminder", async (job) => {
  await getMeetingsContainer().reminders.fire(job.data as ReminderJobData);
});

/** Email `.ics` cho MỘT người (retry 5 lần, mỗi người một job nên không gửi trùng người khác). */
registerJob("notifications", "meeting.ics-send", async (job) => {
  const d = job.data as IcsSendJob;
  await getMeetingsContainer().ics.sendOne(d.meetingId, d.userId, d.kind, d.sequence, d.updated);
});

registerJob("notifications", "meeting.conversation-sync", async (job) => {
  const d = job.data as { meetingId: string; archive?: boolean };
  await getMeetingsContainer().conversationSync.sync({ meetingId: d.meetingId, archive: d.archive });
});

registerJob("notifications", "meeting.lifecycle", async (job) => {
  await getMeetingsContainer().lifecycle.handle(job.data as MeetingRevocationInput);
});

// Redis mất dữ liệu ⇒ job nhắc biến mất: cứ 10 phút quét cuộc họp SCHEDULED trong 25 giờ tới và đặt lại job thiếu (idempotent theo jobId).
registerJob("cron", "meeting.reminder-reconcile", async () => {
  await getMeetingsContainer().reminders.reconcile();
});
defineCron({ schedulerId: "meeting.reminder-reconcile", queue: "cron", jobName: "meeting.reminder-reconcile", pattern: "*/10 * * * *", opts: { attempts: 1 } });
