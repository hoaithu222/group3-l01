import { enqueue, toSafeJobId } from "../../../infrastructure/queue";
import type { MeetingRoomJobsPort } from "./meeting-room.deps";

export const MEETING_HOST_GRACE_JOB = "meeting.host-grace";
export const MEETING_ATTENDANCE_JOB = "meeting.attendance-finalize";

/** `queueConnection` treo vô hạn khi Redis mất (xem `outbox.writer.ts`) — mọi lệnh xếp job PHẢI có thời hạn. */
const TIMEOUT_MS = 2000;

async function bounded<T>(op: Promise<T>, what: string): Promise<T> {
  return Promise.race([op, new Promise<never>((_r, reject) => setTimeout(() => reject(new Error(`${what} quá hạn`)), TIMEOUT_MS).unref())]);
}

/**
 * Việc nền phòng họp trên BullMQ (queue `calls`, be.md §7). `host-grace`: BullMQ giữ job đã xong nên `jobId` cố định sẽ chặn mọi lần hẹn sau — gắn mốc thời
 * gian vào `jobId`, còn `deduplication` mới gộp các lần hẹn dồn dập trong cửa sổ grace (như `call.host-failover` của calls). `attendance-finalize`
 * chỉ chạy MỘT lần mỗi phiên nên `jobId` cố định; processor GHI ĐÈ nên chạy lại vô hại.
 */
export class QueueMeetingRoomJobs implements MeetingRoomJobsPort {
  async scheduleHostGrace(input: { meetingId: string; callId: string }, delayMs: number): Promise<void> {
    await bounded(
      enqueue("calls", MEETING_HOST_GRACE_JOB, input, {
        jobId: toSafeJobId(`meeting.host-grace:call:${input.callId}:${Date.now()}`),
        delay: delayMs,
        deduplication: { id: `meeting.host-grace:${input.callId}`, ttl: Math.max(delayMs, 1000) },
      }),
      "enqueue meeting.host-grace"
    );
  }

  async enqueueAttendanceFinalize(input: { meetingId: string; callId: string }): Promise<void> {
    await bounded(
      enqueue("calls", MEETING_ATTENDANCE_JOB, input, {
        jobId: toSafeJobId(`meeting.attendance-finalize:call:${input.callId}`),
        attempts: 5,
        backoff: { type: "exponential", delay: 5000 },
      }),
      "enqueue meeting.attendance-finalize"
    );
  }
}
