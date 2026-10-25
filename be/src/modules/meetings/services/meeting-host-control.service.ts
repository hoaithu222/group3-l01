import { ValidationError } from "../../../core/exceptions";
import { permissionService } from "../../../core/permission";
import type { AuthUser } from "../../../core/types/express";
import { ErrorCode } from "../../../core/utils/error.codes";
import { logger } from "../../../infrastructure/logger";
import type { MuteAllDto, MuteParticipantDto, ParticipantRoleDto, RemoveParticipantDto } from "../dtos";
import type { MeetingEntity } from "../entities/meeting.interface";
import type { RoomRole } from "../entities/meeting-room.interface";
import type { MeetingAttendeeService } from "./meeting-attendee.service";
import type { RoomCall, RoomParticipant } from "./meeting-call.port";
import { meetError, meetNotFound } from "./meeting-errors";
import { meetingEvents } from "./meeting-events";
import { isInRoom, type MeetingRoomAccess, type RoomActor } from "./meeting-room.access";
import type { MeetingRoomDeps } from "./meeting-room.deps";
import type { MeetingRoomSignals } from "./meeting-room.signals";

const warn = (msg: string, meetingId: string, err: unknown): void => {
  logger.warn(msg, { meetingId, error: err instanceof Error ? err.message : String(err) });
};

/**
 * Điều khiển phòng của chủ trì (be.md §5.5). Mọi thao tác đi qua REST → `IMediaServer` (token client KHÔNG có `roomAdmin`). Luật vai (README §6):
 * chủ trì làm được mọi việc; đồng chủ trì (lịch HOẶC cấp tạm trong phiên) không tác động lên CHỦ TRÌ và chỉ mời ra người thường; cấp/thu
 * đồng chủ trì chỉ chủ trì. Chủ trì KHÔNG bật được mic người khác — chỉ TẮT (P0), người dùng tự bật lại.
 */
export class MeetingHostControlService {
  constructor(
    private readonly d: MeetingRoomDeps,
    private readonly access: MeetingRoomAccess,
    private readonly signals: MeetingRoomSignals,
    private readonly attendees: Pick<MeetingAttendeeService, "remove">
  ) {}

  private async ctx(user: AuthUser, meetingId: string): Promise<{ meeting: MeetingEntity; call: RoomCall; actor: RoomActor }> {
    const meeting = await this.d.repo.findById(meetingId);
    if (!meeting) throw meetNotFound();
    const actor = await this.access.load(meeting, user.id);
    this.access.assertHostLike(actor);
    const call = meeting.status === "LIVE" && meeting.currentCallId ? await this.d.calls.findCall(meeting.currentCallId) : null;
    if (!call || call.status === "ENDED") throw meetError(ErrorCode.MEET_009, 409);
    return { meeting, call, actor };
  }

  private async targetInRoom(call: RoomCall, targetId: string): Promise<RoomParticipant> {
    const p = await this.d.calls.findParticipant(call.id, targetId);
    if (!p || !isInRoom(p)) throw meetError(ErrorCode.MEET_020, 404);
    return p;
  }

  /** Vai của mục tiêu tính như chính họ đang có: lịch ⊕ phiên. */
  private async targetRank(meeting: MeetingEntity, p: RoomParticipant): Promise<"HOST" | "CO_HOST" | "OTHER"> {
    const a = await this.d.repo.findAttendee(meeting.id, p.userId);
    const scheduled = a && !a.removedAt ? a.role : null;
    if (scheduled === "HOST" || p.role === "HOST") return "HOST";
    if (scheduled === "CO_HOST" || p.role === "CO_HOST") return "CO_HOST";
    return "OTHER";
  }

  private assertNotSelf(user: AuthUser, targetId: string): void {
    if (targetId === user.id) throw new ValidationError("Không thể áp dụng cho chính bạn", { userId: ["Không thể thao tác với chính mình"] });
  }

  // ── tắt mic/camera/dừng chia sẻ ────────────────────────────────────────────

  async mute(user: AuthUser, meetingId: string, targetId: string, dto: MuteParticipantDto): Promise<void> {
    const { meeting, call, actor } = await this.ctx(user, meetingId);
    this.assertNotSelf(user, targetId);
    const target = await this.targetInRoom(call, targetId);
    if ((await this.targetRank(meeting, target)) === "HOST" && !actor.isHost) throw meetError(ErrorCode.MEET_019, 403);

    await this.muteTracks(call.livekitRoom, targetId, dto.source);
    if (dto.source === "MICROPHONE") await this.d.calls.setMutedByHost(call.id, targetId, true).catch((err: unknown) => warn("[meetings] Không ghi được mutedByHost", meeting.id, err));
    if (dto.source === "SCREEN_SHARE") await this.d.calls.releaseScreen(call.id, targetId);
    this.signals.hostAction(call.id, [targetId], { type: "MUTED", byUserId: user.id, targetUserId: targetId, source: dto.source });
    await this.audit(user, meeting, "meeting.participant-muted", { callId: call.id, targetUserId: targetId, source: dto.source });
  }

  /** "Tắt mic tất cả": trừ chủ trì/đồng chủ trì và chính người bấm — một lần `listParticipants`, không ghi cờ từng người. */
  async muteAll(user: AuthUser, meetingId: string, _dto: MuteAllDto): Promise<{ mutedCount: number }> {
    const { meeting, call } = await this.ctx(user, meetingId);
    const skip = new Set(await this.access.hostLikeUserIds(meeting));
    skip.add(user.id);
    let mutedCount = 0;
    for (const p of await this.d.media().listParticipants(call.livekitRoom)) {
      if (skip.has(p.identity)) continue;
      const tracks = p.tracks.filter((t) => t.source === "MICROPHONE" && !t.muted);
      for (const t of tracks) await this.d.media().mutePublishedTrack(call.livekitRoom, p.identity, t.sid, true);
      if (tracks.length > 0) mutedCount += 1;
    }
    this.signals.hostAction(call.id, null, { type: "MUTED", byUserId: user.id, source: "MICROPHONE", all: true });
    await this.audit(user, meeting, "meeting.mute-all", { callId: call.id, mutedCount });
    return { mutedCount };
  }

  private async muteTracks(room: string, identity: string, source: MuteParticipantDto["source"]): Promise<void> {
    const live = (await this.d.media().listParticipants(room)).find((p) => p.identity === identity);
    for (const t of live?.tracks.filter((x) => x.source === source && !x.muted) ?? []) await this.d.media().mutePublishedTrack(room, identity, t.sid, true);
  }

  // ── mời ra ─────────────────────────────────────────────────────────────────

  async remove(user: AuthUser, meetingId: string, targetId: string, dto: RemoveParticipantDto): Promise<void> {
    const { meeting, call, actor } = await this.ctx(user, meetingId);
    this.assertNotSelf(user, targetId);
    const target = await this.targetInRoom(call, targetId);
    const rank = await this.targetRank(meeting, target);
    if (rank === "HOST" || (rank === "CO_HOST" && !actor.isHost)) throw meetError(ErrorCode.MEET_019, 403);

    // `REMOVED` là chốt chặn "vào lại": `join` thấy participant REMOVED → `MEET_013` suốt PHIÊN này; phiên mới (bắt đầu lại) là hàng mới.
    await this.d.calls.removeParticipant(call.id, targetId, user.id);
    await permissionService
      .revokeScope({ scope: { type: "CALL", id: call.id }, userIds: [targetId], reason: "REMOVED", cascade: false })
      .catch((err: unknown) => warn("[meetings] revokeScope CALL lỗi (non-fatal)", meeting.id, err));
    if (dto.alsoRemoveAttendee) {
      await this.attendees.remove(user, meetingId, targetId).catch((err: unknown) => warn("[meetings] Không xoá được khỏi danh sách tham dự", meeting.id, err));
    }
    this.signals.hostAction(call.id, [targetId], { type: "REMOVED", byUserId: user.id, targetUserId: targetId });
    await this.audit(user, meeting, "meeting.participant-removed", { callId: call.id, targetUserId: targetId, alsoRemoveAttendee: dto.alsoRemoveAttendee, ...(dto.reason ? { reason: dto.reason } : {}) });
  }

  // ── khoá phòng ─────────────────────────────────────────────────────────────

  async setLock(user: AuthUser, meetingId: string, locked: boolean): Promise<{ lockedAt: string | null; version: number }> {
    const { meeting, call } = await this.ctx(user, meetingId);
    if (!!meeting.lockedAt === locked) return { lockedAt: meeting.lockedAt?.toISOString() ?? null, version: meeting.version };
    const now = this.d.now();
    const updated = await this.d.tx.run(async (tx) => {
      const cur = await this.d.repo.updateMeeting(tx, meeting.id, undefined, { lockedAt: locked ? now : null }, { statusIn: ["LIVE"] });
      if (!cur) return null;
      await this.d.outbox.add(tx, meetingEvents.lockChanged({ meetingId: meeting.id, version: cur.version, callId: call.id, lockedAt: locked ? now.toISOString() : null, actorId: user.id }));
      return cur;
    });
    if (!updated) throw meetError(ErrorCode.MEET_009, 409);
    this.signals.updated(updated, call.id, { lockedAt: updated.lockedAt ? updated.lockedAt.toISOString() : null });
    await this.audit(user, meeting, locked ? "meeting.lock" : "meeting.unlock", { callId: call.id });
    return { lockedAt: updated.lockedAt ? updated.lockedAt.toISOString() : null, version: updated.version };
  }

  // ── vai trò trong phiên ────────────────────────────────────────────────────

  /** Cấp/thu `CO_HOST` TRONG PHIÊN (không đổi lịch họp) — chỉ chủ trì; mục tiêu phải đang trong phòng, không đổi vai chủ trì/đồng chủ trì theo lịch. */
  async setSessionRole(user: AuthUser, meetingId: string, targetId: string, dto: ParticipantRoleDto): Promise<RoomParticipant> {
    const { meeting, call, actor } = await this.ctx(user, meetingId);
    if (!actor.isHost) throw meetError(ErrorCode.MEET_002, 403);
    this.assertNotSelf(user, targetId);
    const updated = await this.applyRole(meeting, call, user.id, targetId, dto.role);
    await this.audit(user, meeting, "meeting.participant-role", { callId: call.id, targetUserId: targetId, role: dto.role });
    return updated;
  }

  /** Giao quyền điều khiển: người nhận thành `CO_HOST` phiên, người giao GIỮ vai (be.md §5.5 `transferControl`). Chủ trì/đồng chủ trì đều giao được. */
  async transferControl(user: AuthUser, meetingId: string, toUserId: string): Promise<void> {
    const { meeting, call } = await this.ctx(user, meetingId);
    this.assertNotSelf(user, toUserId);
    const target = await this.targetInRoom(call, toUserId);
    if ((await this.targetRank(meeting, target)) !== "OTHER") return; // đã là chủ trì/đồng chủ trì (lịch hoặc phiên): không có gì để giao
    await this.applyRole(meeting, call, user.id, toUserId, "CO_HOST");
    await this.audit(user, meeting, "meeting.transfer-control", { callId: call.id, targetUserId: toUserId });
  }

  /** Dùng chung cho giao quyền khi rời, host-grace, đổi vai: `byUserId = null` ⇒ hệ thống. */
  async applyRole(meeting: MeetingEntity, call: RoomCall, byUserId: string | null, targetId: string, role: RoomRole): Promise<RoomParticipant> {
    const target = await this.targetInRoom(call, targetId);
    const scheduled = (await this.d.repo.findAttendee(meeting.id, targetId))?.role;
    // Chủ trì/đồng chủ trì THEO LỊCH giữ vai của lịch — chỉ người thường mới được cấp/thu vai tạm trong phiên.
    if (scheduled === "HOST" || scheduled === "CO_HOST" || target.role === "HOST") throw meetError(ErrorCode.MEET_019, 403);
    const updated = await this.d.calls.setRole(call.id, targetId, role);
    if (!updated) throw meetError(ErrorCode.MEET_020, 404);
    await this.d
      .media()
      .updateParticipant(call.livekitRoom, targetId, { metadata: JSON.stringify({ v: 1, callId: call.id, meetingId: meeting.id, role }) })
      .catch((err: unknown) => warn("[meetings] Không cập nhật metadata vai trò (non-fatal)", meeting.id, err));
    this.signals.hostAction(call.id, [targetId], { type: "ROLE_CHANGED", byUserId, targetUserId: targetId, role });
    return updated;
  }

  // ── hạ tay ─────────────────────────────────────────────────────────────────

  /**
   * Hạ tay MỘT người (Meet/Zoom): xoá attribute `handRaisedAt` của người đó trong LiveKit (tay đang hạ thì bỏ qua bước này) rồi báo RIÊNG họ
   * `HAND_LOWERED`. ⚠️ Vẫn báo kể cả khi attribute đã rỗng: lệnh giơ tay của họ có thể còn trên đường tới LiveKit — client nhận tín hiệu thì
   * bỏ ý định đang chờ và tự xoá lần nữa (idempotent). Như "hạ tay mọi người": đồng chủ trì hạ được tay của chủ trì (việc vô hại).
   */
  async lowerHand(user: AuthUser, meetingId: string, targetId: string): Promise<void> {
    const { call } = await this.ctx(user, meetingId);
    this.assertNotSelf(user, targetId);
    await this.targetInRoom(call, targetId);
    const live = (await this.d.media().listParticipants(call.livekitRoom)).find((p) => p.identity === targetId);
    if (live?.attributes.handRaisedAt) await this.d.media().updateParticipant(call.livekitRoom, targetId, { attributes: { handRaisedAt: "" } });
    this.signals.hostAction(call.id, [targetId], { type: "HAND_LOWERED", byUserId: user.id, targetUserId: targetId });
  }

  /** "Hạ tay mọi người": xoá attribute `handRaisedAt` của từng người trong LiveKit (client tự đặt lại khi giơ tay), song song ≤ 10. */
  async lowerAllHands(user: AuthUser, meetingId: string): Promise<void> {
    const { call } = await this.ctx(user, meetingId);
    const raised = (await this.d.media().listParticipants(call.livekitRoom)).filter((p) => !!p.attributes.handRaisedAt);
    for (let i = 0; i < raised.length; i += 10) {
      await Promise.all(
        raised.slice(i, i + 10).map((p) => this.d.media().updateParticipant(call.livekitRoom, p.identity, { attributes: { handRaisedAt: "" } }).catch((err: unknown) => warn("[meetings] Không hạ tay được", call.id, err)))
      );
    }
    this.signals.hostAction(call.id, null, { type: "LOWER_ALL_HANDS", byUserId: user.id });
  }

  audit(user: AuthUser, meeting: MeetingEntity, action: string, metadata: Record<string, unknown>): Promise<void> {
    return this.d.audit.record({ actorId: user.id, action, targetType: "Meeting", targetId: meeting.id, workspaceId: meeting.workspaceId, metadata });
  }
}
