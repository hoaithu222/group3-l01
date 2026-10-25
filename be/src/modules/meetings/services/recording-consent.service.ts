import { randomUUID } from "crypto";
import type { AuthUser } from "../../../core/types/express";
import { ErrorCode } from "../../../core/utils/error.codes";
import { logger } from "../../../infrastructure/logger";
import type { ConsentResponseDto } from "../dtos";
import type { ConsentEntry, ConsentStatusDto } from "../entities/meeting-recap.interface";
import type { RoomParticipant } from "./meeting-call.port";
import { meetError, meetNotFound } from "./meeting-errors";
import { isInRoom } from "./meeting-room.access";
import type { MeetingRoomDeps } from "./meeting-room.deps";
import { MeetingTokenPolicy } from "./meeting-token.policy";
import { loadViewer } from "./recap-recording.access";
import type { RecordingConsentStore, ConsentAnswer, ConsentRequest } from "./recording-consent.store";
import { grantPublishOnMediaServer } from "./recording-publish";
import { notController, type RecordingGuards } from "./recording-guards";
import type { RecordingSignals } from "./recording-signals";
import type { RecordingRuntimeLimits } from "./recording-runtime";

/** Người TRONG phòng lúc này (đang vào/kết nối/nối lại) chia theo câu trả lời đồng ý — người chưa trả lời là `pending`. */
export interface ConsentTally {
  inRoom: RoomParticipant[];
  answers: Map<string, ConsentAnswer>;
  accepted: string[];
  declined: string[];
  pending: string[];
}

/**
 * `RecordingConsentService` (be.md §5.3): yêu cầu đồng ý → mọi người đang trong phòng trả lời → chủ trì bắt đầu ghi khi TẤT CẢ đồng ý (D-10, D-15). Người
 * vào SAU khi bản ghi đã chạy đồng ý riêng lẻ (đồng ý → được cấp quyền phát + ghi vào `consentSnapshot`; từ chối → chỉ nghe/xem). KHÔNG BAO GIỜ ghi
 * khi thiếu đồng ý; chủ trì chỉ thấy SỐ người chưa đồng ý/từ chối, không tên (tránh áp lực — README §2).
 */
export class RecordingConsentService {
  constructor(
    private readonly d: MeetingRoomDeps,
    private readonly store: RecordingConsentStore,
    private readonly guards: RecordingGuards,
    private readonly signals: RecordingSignals,
    private readonly limits: () => Promise<RecordingRuntimeLimits>
  ) {}

  /** Đếm theo câu trả lời của yêu cầu `requestId` (dùng cả cho `status` và điều kiện bắt đầu ghi). */
  async tally(callId: string, requestId: string): Promise<ConsentTally> {
    const [participants, answers] = await Promise.all([this.d.calls.listParticipants(callId), this.store.answers(callId, requestId)]);
    const inRoom = participants.filter(isInRoom);
    const accepted = inRoom.filter((p) => answers.get(p.userId)?.accept === true).map((p) => p.userId);
    const declined = inRoom.filter((p) => answers.get(p.userId)?.accept === false).map((p) => p.userId);
    const decided = new Set([...accepted, ...declined]);
    return { inRoom, answers, accepted, declined, pending: inRoom.filter((p) => !decided.has(p.userId)).map((p) => p.userId) };
  }

  /** `POST .../recordings/consent-request` — người yêu cầu tự đồng ý; phát `call:recording CONSENT_REQUESTED` tới cả phòng. */
  async request(user: AuthUser, meetingId: string): Promise<{ requestId: string; expiresAt: string; pendingCount: number }> {
    const { meeting, call } = await this.guards.assertCanRecord(user, meetingId);
    const { consentRequestTtlSeconds } = await this.limits();
    const now = this.d.now();
    const req = await this.store.open(call.id, { requestId: randomUUID(), requestedBy: user.id }, consentRequestTtlSeconds, now);
    await this.store.answer(call.id, req, user.id, true, now);
    const t = await this.tally(call.id, req.requestId);
    this.signals.callRecording(call.id, meeting.id, { state: "CONSENT_REQUESTED", requestId: req.requestId, expiresAt: req.expiresAt, requestedBy: user.id, acceptedCount: t.accepted.length, pendingCount: t.pending.length, declinedCount: t.declined.length });
    await this.d.audit.record({ actorId: user.id, action: "recording.consent-request", targetType: "Meeting", targetId: meeting.id, workspaceId: meeting.workspaceId, metadata: { callId: call.id, requestId: req.requestId } });
    return { requestId: req.requestId, expiresAt: req.expiresAt, pendingCount: t.pending.length };
  }

  /** `GET .../consent-status` — chỉ chủ trì/đồng chủ trì; chưa có yêu cầu hiệu lực → `REC_008`. */
  async status(user: AuthUser, meetingId: string): Promise<ConsentStatusDto> {
    const meeting = await this.d.repo.findById(meetingId);
    if (!meeting) throw meetNotFound();
    const viewer = await loadViewer(this.d, meeting, user.id);
    if (!viewer.isHostLike) throw notController(viewer);
    if (meeting.status !== "LIVE" || !meeting.currentCallId) throw meetError(ErrorCode.REC_007, 409);
    const req = await this.store.current(meeting.currentCallId);
    if (!req) throw meetError(ErrorCode.REC_008, 409);
    const t = await this.tally(meeting.currentCallId, req.requestId);
    return this.statusOf(req, t);
  }

  statusOf(req: ConsentRequest, t: ConsentTally): ConsentStatusDto {
    return {
      requestId: req.requestId,
      expiresAt: req.expiresAt,
      connectedCount: t.inRoom.length,
      acceptedCount: t.accepted.length,
      declinedCount: t.declined.length,
      pendingCount: t.pending.length,
      ready: t.inRoom.length >= 1 && t.pending.length === 0 && t.declined.length === 0,
    };
  }

  /** `POST .../recordings/consent` — người TRONG phòng trả lời. Đang ghi → nhánh "người vào sau"; chưa ghi → khớp yêu cầu hiện hành (`REC_008` nếu hết hạn). */
  async respond(user: AuthUser, meetingId: string, dto: ConsentResponseDto): Promise<{ accepted: boolean; canPublish: boolean }> {
    const meeting = await this.d.repo.findById(meetingId);
    if (!meeting || meeting.status !== "LIVE" || !meeting.currentCallId) throw meetNotFound();
    const callId = meeting.currentCallId;
    const me = await this.d.calls.findParticipant(callId, user.id);
    if (!me || !isInRoom(me)) throw meetError(ErrorCode.MEET_020, 404);

    const active = await this.d.recordings.findActiveByCall(callId);
    if (active) return this.respondLate(meeting.id, callId, me, active.id, active.status, dto.accept);

    const req = await this.store.current(callId);
    // Chưa ghi: BẮT BUỘC trả lời đúng yêu cầu đang hiệu lực (thiếu/lệch `requestId` → REC_008) — không để "đồng ý nhầm" một yêu cầu client chưa thấy.
    if (!req || dto.requestId !== req.requestId) throw meetError(ErrorCode.REC_008, 409);
    await this.store.answer(callId, req, user.id, dto.accept, this.d.now());
    const t = await this.tally(callId, req.requestId);
    this.signals.callRecording(callId, meeting.id, { state: "CONSENT_PROGRESS", requestId: req.requestId, expiresAt: req.expiresAt, acceptedCount: t.accepted.length, pendingCount: t.pending.length, declinedCount: t.declined.length });
    return { accepted: dto.accept, canPublish: true };
  }

  /** Người vào sau (hoặc chưa trả lời) khi bản ghi ĐÃ chạy: đồng ý → ghi `consentSnapshot` + mở quyền phát (DB + LiveKit); từ chối → giữ nghe/xem. */
  private async respondLate(meetingId: string, callId: string, me: RoomParticipant, recordingId: string, status: string, accept: boolean): Promise<{ accepted: boolean; canPublish: boolean }> {
    if (status === "STOPPING") throw meetError(ErrorCode.REC_002, 409); // đang dừng: không còn gì để đồng ý
    if (!accept) return { accepted: false, canPublish: false };
    const entry: ConsentEntry = { userId: me.userId, at: this.d.now(), lateJoin: true };
    await this.d.recordings.pushConsent(recordingId, entry);
    const role = me.role === "HOST" ? "HOST" : me.role === "CO_HOST" ? "CO_HOST" : "MEMBER";
    const publish = MeetingTokenPolicy.publishFor({ role, recording: { active: true, consented: true } });
    await this.d.calls.setPublishPermissions(callId, me.userId, publish);
    await grantPublishOnMediaServer(this.d, callId, me.userId, publish, !me.mutedByHost).catch((err: unknown) =>
      logger.warn("[meetings] Không cập nhật quyền phát trên LiveKit sau khi đồng ý ghi hình (non-fatal — token làm mới sẽ mang quyền mới)", { meetingId, error: err instanceof Error ? err.message : String(err) })
    );
    return { accepted: true, canPublish: true };
  }
}
