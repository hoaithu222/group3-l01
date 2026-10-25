import type { AdminMediaUpdate } from "./admin-media-updated.publisher";

/** Phần tối thiểu của sự kiện outbox mà ánh xạ cần — khớp cấu trúc `MeetingEventPayload`/`CallSignalPayload` mà KHÔNG import kiểu nội bộ của module khác. */
export interface MeetingEventLike {
  event: string;
  meetingId: string;
  recordingId?: string;
}
export interface CallSignalLike {
  event: string;
  callId: string;
}

/** Sự kiện cuộc họp nào làm bảng admin đổi (be.md §5.8): bắt đầu/kết thúc/huỷ và bản ghi hình sẵn sàng. Còn lại (đổi tiêu đề, người tham dự…) không ảnh hưởng số liệu vận hành. */
export function meetingEventToUpdate(p: MeetingEventLike): AdminMediaUpdate | null {
  switch (p.event) {
    case "started":
      return { kind: "MEETING", id: p.meetingId, status: "LIVE" };
    case "ended":
      return { kind: "MEETING", id: p.meetingId, status: "ENDED" };
    case "cancelled":
      return { kind: "MEETING", id: p.meetingId, status: "CANCELLED" };
    case "recording-ready":
      return p.recordingId ? { kind: "RECORDING", id: p.recordingId, status: "READY" } : null;
    default:
      return null;
  }
}

export function callSignalToUpdate(p: CallSignalLike): AdminMediaUpdate | null {
  return p.event === "ended" ? { kind: "CALL", id: p.callId, status: "ENDED" } : null;
}
