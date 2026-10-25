import type { RoomRecordingStateDto } from "../entities/meeting-recap.interface";
import type { MeetingRoomDeps } from "./meeting-room.deps";
import { RecordingConsentStore } from "./recording-consent.store";

/**
 * Trạng thái ghi hình của phòng CHO MỘT NGƯỜI (`JoinResultDto.recording`, `RoomSnapshotDto.recording`) — để người vào sau/reconnect luôn thấy chỉ báo "Đang ghi
 * hình" (RR-19) và hộp thoại đồng ý đúng lúc: bản ghi đang chạy → trạng thái đó (`consentRequired` = người này chưa nằm trong `consentSnapshot`); chưa ghi nhưng
 * chủ trì đã hỏi ý kiến còn hạn → `CONSENT_REQUESTED` (`consentRequired` = người này chưa trả lời). Không có gì → `null`.
 */
export async function roomRecordingState(d: MeetingRoomDeps, callId: string, userId: string): Promise<RoomRecordingStateDto | null> {
  const active = await d.recordings.findActiveByCall(callId);
  if (active) {
    return {
      status: active.status,
      consentRequired: !active.consentSnapshot.some((c) => c.userId === userId),
      startedBy: active.startedBy,
      startedAt: active.startedAt.toISOString(),
      recordingId: active.id,
    };
  }
  const store = new RecordingConsentStore(d.store.port);
  const req = await store.current(callId).catch(() => null);
  if (!req) return null;
  const answers = await store.answers(callId, req.requestId).catch(() => new Map());
  return { status: "CONSENT_REQUESTED", consentRequired: !answers.has(userId), startedBy: req.requestedBy, requestId: req.requestId, expiresAt: req.expiresAt };
}
