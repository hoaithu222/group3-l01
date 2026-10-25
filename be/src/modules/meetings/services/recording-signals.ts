import { SocketEvent } from "../../../infrastructure/socket/socket.events";
import { ROOM } from "../../../infrastructure/socket/socket.rooms";
import type { MeetingEntity } from "../entities/meeting.interface";
import type { RecordingEntity } from "../entities/meeting-recap.interface";
import type { MeetingRoomAccess } from "./meeting-room.access";
import type { MeetingRoomDeps } from "./meeting-room.deps";

/** Trạng thái phát trong `call:recording` (be.md §6) — `STARTING` để chỉ báo "Đang ghi hình" hiện NGAY khi bấm bắt đầu (trước webhook `egress_started`). */
export type CallRecordingState = "CONSENT_REQUESTED" | "CONSENT_PROGRESS" | "STARTING" | "RECORDING" | "STOPPING" | "STOPPED" | "FAILED";

export interface CallRecordingBody {
  state: CallRecordingState;
  requestId?: string;
  expiresAt?: string;
  acceptedCount?: number;
  pendingCount?: number;
  declinedCount?: number;
  recordingId?: string;
  startedAt?: string;
  requestedBy?: string;
}

/**
 * Tín hiệu socket của ghi hình (be.md §6). Phát TRỰC TIẾP từ nơi thay đổi trạng thái (API hoặc worker — `emitTo*` chạy được ở cả hai nhờ cầu nối Redis);
 * lỗi phát chỉ log, không làm hỏng thao tác — nguồn sự thật là Mongo (`MeetingRecording`), client luôn đồng bộ lại qua `GET /meetings/:id/room`.
 * Payload `call:recording` chỉ có SỐ LƯỢNG đồng ý — không tên người từ chối (README p2-06 §2).
 */
export class RecordingSignals {
  constructor(
    private readonly d: MeetingRoomDeps,
    private readonly access: MeetingRoomAccess
  ) {}

  /** → `call:{callId}` (mọi người đang ở phòng, kể cả người vào sau qua room join). */
  callRecording(callId: string, meetingId: string, body: CallRecordingBody): void {
    this.d.emitter.toRoom(ROOM.call(callId), SocketEvent.CALL_RECORDING, { callId, meetingId, ...body });
  }

  callRecordingOf(rec: RecordingEntity, state: CallRecordingState): void {
    this.callRecording(rec.callId, rec.meetingId, { state, recordingId: rec.id, startedAt: rec.startedAt.toISOString(), requestedBy: rec.startedBy });
  }

  /** → `meet:{id}` + chủ trì/đồng chủ trì: mọi đổi trạng thái bản ghi (READY, FAILED, xoá…) để danh sách/chi tiết làm mới. */
  async recordingUpdated(meeting: MeetingEntity, rec: RecordingEntity, extra: { deleted?: boolean } = {}): Promise<void> {
    const payload = {
      meetingId: meeting.id,
      recordingId: rec.id,
      status: rec.status,
      ...(rec.durationSec !== null ? { durationSec: rec.durationSec } : {}),
      ...(rec.retentionExpiresAt ? { retentionExpiresAt: rec.retentionExpiresAt.toISOString() } : {}),
      ...(extra.deleted ? { deleted: true } : {}),
    };
    const hosts = await this.access.hostLikeUserIds(meeting).catch(() => [] as string[]);
    this.d.emitter.toRoom(ROOM.meeting(meeting.id), SocketEvent.MEETING_RECORDING_UPDATED, payload);
    if (hosts.length > 0) this.d.emitter.toUsers(hosts, SocketEvent.MEETING_RECORDING_UPDATED, payload);
  }
}
