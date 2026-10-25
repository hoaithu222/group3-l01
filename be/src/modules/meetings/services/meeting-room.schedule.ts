import type { CallEndReason } from "@prisma/client";
import { LIMITS } from "../../../core/constants/limits";
import type { OutboxEventInput } from "../../../infrastructure/queue";
import type { MeetingEndReasonValue } from "../entities/meeting.interface";

export const MEETING_AUTO_CLOSE_JOB = "meeting.auto-close";
export type AutoClosePhase = "WARN" | "CLOSE";

/**
 * Giờ TỰ ĐÓNG phiên họp (be.md §2 "Tự đóng phòng", §5.1 bước 8) — hàm THUẦN: `min(bắt đầu phiên + maxMinutes, endAt + restartWindow)`.
 * Phiên bắt đầu lại sát hạn `endAt + restartWindow` vẫn chạy tối thiểu `minRestartRunMinutes` (nếu không, "bắt đầu lại" sẽ tự đóng ngay).
 */
export function autoCloseAt(m: { endAt: Date }, sessionStart: Date, limits: { maxMinutes: number; restartWindowMinutes: number }): Date {
  const byMax = sessionStart.getTime() + limits.maxMinutes * 60_000;
  const byEnd = Math.max(m.endAt.getTime() + limits.restartWindowMinutes * 60_000, sessionStart.getTime() + LIMITS.meeting.minRestartRunMinutes * 60_000);
  return new Date(Math.min(byMax, byEnd));
}

/**
 * Hàng outbox HẸN GIỜ (`availableAt`) cho job `meeting.auto-close` (queue `calls`): bền qua restart Redis/worker, dedupe theo (cuộc họp, phiên,
 * pha, giờ) nên gia hạn `endAt` khi đang họp chỉ thêm hàng mới. Processor luôn KIỂM LẠI `status = LIVE && currentCallId = callId` — hàng thừa vô hại.
 */
export function autoCloseEvent(p: { meetingId: string; callId: string; phase: AutoClosePhase; at: Date }): OutboxEventInput {
  return {
    type: MEETING_AUTO_CLOSE_JOB,
    aggregateType: "Meeting",
    aggregateId: p.meetingId,
    queue: "calls",
    jobName: MEETING_AUTO_CLOSE_JOB,
    dedupeKey: `meeting.auto-close:meeting:${p.meetingId}:call:${p.callId}:${p.phase}:${p.at.getTime()}`,
    payload: { meetingId: p.meetingId, callId: p.callId, phase: p.phase },
    availableAt: p.at,
  };
}

/** Cảnh báo (nếu còn ở tương lai) rồi đóng — thứ tự ghi vào outbox. */
export function autoCloseEvents(p: { meetingId: string; callId: string; closeAt: Date; now: Date }): OutboxEventInput[] {
  const warnAt = new Date(p.closeAt.getTime() - LIMITS.meeting.closingWarningMinutes * 60_000);
  return [
    ...(warnAt.getTime() > p.now.getTime() ? [autoCloseEvent({ meetingId: p.meetingId, callId: p.callId, phase: "WARN", at: warnAt })] : []),
    autoCloseEvent({ meetingId: p.meetingId, callId: p.callId, phase: "CLOSE", at: p.closeAt }),
  ];
}

/** Lý do kết thúc cuộc họp → lý do kết thúc `Call` (`CallEndService.endCall`). */
export function callEndReasonOf(reason: MeetingEndReasonValue): CallEndReason {
  switch (reason) {
    case "WORKSPACE_ARCHIVED":
      return "ARCHIVED";
    case "HOST_REMOVED":
      return "REVOKED";
    default:
      return reason; // HOST_ENDED | EMPTY | MAX_DURATION | FORCE_ENDED trùng tên
  }
}

/** Ngược lại: `Call` đã bị kết thúc từ nơi khác (`calls` thu hồi/admin/`room_finished`) → lý do của CUỘC HỌP. */
export function meetingEndReasonOf(reason: CallEndReason | null): MeetingEndReasonValue {
  switch (reason) {
    case "HOST_ENDED":
    case "MAX_DURATION":
    case "FORCE_ENDED":
    case "EMPTY":
      return reason;
    case "ARCHIVED":
      return "WORKSPACE_ARCHIVED";
    case "REVOKED":
      return "HOST_REMOVED";
    default:
      return "EMPTY";
  }
}
