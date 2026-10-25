import { cancelJob, enqueue, scheduleAt, toSafeJobId } from "../../../infrastructure/queue";

/** `queueConnection` treo vô hạn khi Redis mất (xem `outbox.writer.ts`) — mọi lệnh xếp job PHẢI có thời hạn. */
const TIMEOUT_MS = 2000;

async function bounded<T>(op: Promise<T>, what: string): Promise<T> {
  return Promise.race([op, new Promise<never>((_r, reject) => setTimeout(() => reject(new Error(`${what} quá hạn`)), TIMEOUT_MS).unref())]);
}

export interface IcsSendJob {
  meetingId: string;
  userId: string;
  kind: "REQUEST" | "CANCEL";
  sequence: number;
  updated: boolean;
}

/**
 * Việc nền do handler yêu cầu. `jobId` nhắc họp = `(cuộc họp, mốc phút, INSTANT bắt đầu)` — tất định, tính lại được khi huỷ/dời
 * giờ mà không cần lưu version; đổi giờ ⇒ id khác (job cũ bị xoá hoặc no-op vì lệch `startAt`), giữ nguyên giờ ⇒ cùng id (BullMQ
 * bỏ qua lần thêm thứ hai). Khác be.md §7 (`…:v<version>`): version tăng cả khi chỉ đổi người tham dự nên sẽ mồ côi job nhắc.
 */
export interface MeetingJobsPort {
  scheduleReminder(input: { meetingId: string; minutes: number; startAt: Date }): Promise<void>;
  cancelReminder(input: { meetingId: string; minutes: number; startAt: Date }): Promise<void>;
  enqueueIcsSend(job: IcsSendJob): Promise<void>;
  enqueueConversationSync(input: { meetingId: string; version: number; archive?: boolean }): Promise<void>;
}

export const reminderJobId = (meetingId: string, minutes: number, startAt: Date): string =>
  toSafeJobId(`meeting.reminder:meeting:${meetingId}:${minutes}:s${Math.floor(startAt.getTime() / 1000)}`);

export class QueueMeetingJobs implements MeetingJobsPort {
  async scheduleReminder(i: { meetingId: string; minutes: number; startAt: Date }): Promise<void> {
    const runAt = new Date(i.startAt.getTime() - i.minutes * 60_000);
    if (runAt.getTime() <= Date.now()) return; // mốc đã qua
    await bounded(
      scheduleAt("notifications", "meeting.reminder", reminderJobId(i.meetingId, i.minutes, i.startAt), { meetingId: i.meetingId, minutes: i.minutes, startAtMs: i.startAt.getTime() }, runAt),
      "scheduleAt meeting.reminder"
    );
  }

  async cancelReminder(i: { meetingId: string; minutes: number; startAt: Date }): Promise<void> {
    await bounded(cancelJob("notifications", reminderJobId(i.meetingId, i.minutes, i.startAt)), "cancelJob meeting.reminder");
  }

  async enqueueIcsSend(job: IcsSendJob): Promise<void> {
    await bounded(
      enqueue("notifications", "meeting.ics-send", job, {
        jobId: toSafeJobId(`meeting.ics-send:meeting:${job.meetingId}:v${job.sequence}:${job.userId}:${job.kind}`),
        attempts: 5,
        backoff: { type: "exponential", delay: 10_000 },
      }),
      "enqueue meeting.ics-send"
    );
  }

  async enqueueConversationSync(i: { meetingId: string; version: number; archive?: boolean }): Promise<void> {
    await bounded(
      enqueue("notifications", "meeting.conversation-sync", { meetingId: i.meetingId, version: i.version, archive: !!i.archive }, {
        jobId: toSafeJobId(`meeting.conversation-sync:meeting:${i.meetingId}:v${i.version}${i.archive ? ":archive" : ""}`),
      }),
      "enqueue meeting.conversation-sync"
    );
  }
}
