import type { OutboxEventInput } from "../../../infrastructure/queue";
import type { MeetingEndReasonValue, MeetingRsvpValue } from "../entities/meeting.interface";

/**
 * Sự kiện outbox của cuộc họp (p2-04 be.md §7). MỌI tác động sau commit (nhắc, thông báo, socket, email `.ics`, đồng bộ nhóm chat,
 * bump quyền) đi qua MỘT job `meeting.events` (queue `notifications`) — mỗi cặp queue/jobName chỉ có 1 processor, nên các consumer
 * khác (p2-05 phòng họp, p2-06 biên bản) đăng ký SINK thay vì đòi hàng outbox riêng. `dedupeKey` (unique) theo (cuộc họp, version):
 * mọi thay đổi ghi đều tăng `Meeting.version` nên không trùng.
 */
export const MEETINGS_QUEUE = "notifications" as const;
export const MEETING_EVENTS_JOB = "meeting.events";

export type MeetingEventPayload =
  | { event: "created"; meetingId: string; version: number }
  | {
      event: "updated";
      meetingId: string;
      version: number;
      oldVersion: number;
      changedFields: string[];
      oldReminderMinutes: number[];
      oldStartAt: string;
      actorId: string | null;
      icsRelevant: boolean;
      /** Đổi giờ/địa điểm/link → push `meeting.updated`; đổi khác (tiêu đề, agenda) chỉ socket. */
      notifyRelevant: boolean;
    }
  | { event: "cancelled"; meetingId: string; version: number; actorId: string | null; byAdmin: boolean; alsoDeleted: boolean; oldReminderMinutes: number[]; systemReason?: string }
  | { event: "deleted"; meetingId: string; version: number }
  | {
      event: "attendees-changed";
      meetingId: string;
      version: number;
      actorId: string | null;
      added: Array<{ userId: string; role: string }>;
      removed: string[];
      wasLive: boolean;
      /** (p2-05) Người vào qua link (không được mời): chỉ đồng bộ nhóm chat — KHÔNG thông báo "được mời"/gửi `.ics`. */
      viaLink?: boolean;
    }
  | { event: "roles-changed"; meetingId: string; version: number; actorId: string | null; userIds: string[] }
  | { event: "host-transferred"; meetingId: string; version: number; fromUserId: string; toUserId: string }
  // ── p2-05 phòng họp ────────────────────────────────────────────────────────
  | { event: "started"; meetingId: string; version: number; callId: string; startedBy: string; restarted: boolean }
  | { event: "ended"; meetingId: string; version: number; callId: string | null; reason: MeetingEndReasonValue; actorId: string | null; startedAt: string | null }
  | { event: "lock-changed"; meetingId: string; version: number; callId: string | null; lockedAt: string | null; actorId: string }
  // ── p2-06 biên bản & ghi hình (sink `p2-06` xử lý; `version` = `publishedVersion` / phiên bản bản ghi) ──
  | { event: "recap-published"; meetingId: string; version: number; recapId: string; firstPublish: boolean; actorId: string }
  | { event: "recording-ready"; meetingId: string; version: number; recordingId: string };

function build(payload: MeetingEventPayload): OutboxEventInput {
  return {
    type: `meeting.${payload.event}`,
    aggregateType: "Meeting",
    aggregateId: payload.meetingId,
    queue: MEETINGS_QUEUE,
    jobName: MEETING_EVENTS_JOB,
    dedupeKey: `meeting.${payload.event}:meeting:${payload.meetingId}:v${payload.version}`,
    payload: { ...payload },
  };
}

export const meetingEvents = {
  created: (meetingId: string, version: number) => build({ event: "created", meetingId, version }),
  updated: (p: Omit<Extract<MeetingEventPayload, { event: "updated" }>, "event">) => build({ event: "updated", ...p }),
  cancelled: (p: Omit<Extract<MeetingEventPayload, { event: "cancelled" }>, "event">) => build({ event: "cancelled", ...p }),
  deleted: (meetingId: string, version: number) => build({ event: "deleted", meetingId, version }),
  attendeesChanged: (p: Omit<Extract<MeetingEventPayload, { event: "attendees-changed" }>, "event">) => build({ event: "attendees-changed", ...p }),
  rolesChanged: (meetingId: string, version: number, actorId: string | null, userIds: string[]) => build({ event: "roles-changed", meetingId, version, actorId, userIds }),
  hostTransferred: (meetingId: string, version: number, fromUserId: string, toUserId: string) =>
    build({ event: "host-transferred", meetingId, version, fromUserId, toUserId }),
  started: (p: Omit<Extract<MeetingEventPayload, { event: "started" }>, "event">) => build({ event: "started", ...p }),
  ended: (p: Omit<Extract<MeetingEventPayload, { event: "ended" }>, "event">) => build({ event: "ended", ...p }),
  lockChanged: (p: Omit<Extract<MeetingEventPayload, { event: "lock-changed" }>, "event">) => build({ event: "lock-changed", ...p }),
  recapPublished: (p: Omit<Extract<MeetingEventPayload, { event: "recap-published" }>, "event">) => build({ event: "recap-published", ...p }),
  /** `dedupeKey` theo bản ghi (một cuộc họp có nhiều bản ghi — khoá theo `(meetingId, version)` của `build` sẽ đụng nhau). */
  recordingReady: (p: Omit<Extract<MeetingEventPayload, { event: "recording-ready" }>, "event">): OutboxEventInput => ({
    ...build({ event: "recording-ready", ...p }),
    dedupeKey: `recording.ready:recording:${p.recordingId}`,
  }),
};

export type RsvpSummary = Record<MeetingRsvpValue, number>;
