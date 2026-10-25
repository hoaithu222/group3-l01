import type { MeetingRsvp, MeetingStatus } from './meetings.types';

/** Payload socket `meeting:*` (BE `be.md` p2-04 §6). Mọi payload có `v:1`, `meetingId`, `version`. */
export interface MeetingUpdatedPayload {
  changedFields?: string[];
  endAt?: string;
  meetingId: string;
  rsvpSummary?: Record<MeetingRsvp, number>;
  startAt?: string;
  status?: MeetingStatus;
  version: number;
}

export interface MeetingCancelledPayload {
  cancelReason?: string;
  meetingId: string;
  version: number;
}

export interface AttendeeRemovedPayload {
  meetingId: string;
  userId: string;
  version: number;
}

/** Dạng tối thiểu (chỉ `meetingId`) — dùng chung cho `meeting:invited`, sự kiện biên bản/bản ghi và bắt đầu/kết thúc phiên. */
export interface MeetingInvitedPayload {
  meetingId: string;
}
