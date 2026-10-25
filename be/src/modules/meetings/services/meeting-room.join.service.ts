import { LIMITS } from "../../../core/constants/limits";
import { AppError } from "../../../core/exceptions";
import type { AuthUser } from "../../../core/types/express";
import { ErrorCode, ErrorMessages } from "../../../core/utils/error.codes";
import type { JoinMeetingDto } from "../dtos";
import type { MeetingEntity } from "../entities/meeting.interface";
import type { JoinResultDto, RoomRole } from "../entities/meeting-room.interface";
import { AttendeeConflictError } from "../repositories/meeting.repository.interface";
import { joinOpensAt } from "./meeting-actions.calculator";
import type { RoomCall, RoomParticipant } from "./meeting-call.port";
import { meetError, meetNotFound } from "./meeting-errors";
import { meetingEvents } from "./meeting-events";
import { isInRoom, type MeetingRoomAccess, type RoomActor } from "./meeting-room.access";
import type { MeetingRoomDeps } from "./meeting-room.deps";
import type { MeetingRoomSignals } from "./meeting-room.signals";
import { MeetingTokenPolicy } from "./meeting-token.policy";
import { roomRecordingState } from "./recording-state";

const withinSeconds = (at: Date | null, now: Date, seconds: number): boolean => !!at && now.getTime() - at.getTime() <= seconds * 1000;
const sessionRole = (role: string): RoomRole => (role === "HOST" ? "HOST" : role === "CO_HOST" ? "CO_HOST" : "MEMBER");

/**
 * `join` (be.md §5.2) — vào phòng họp CÓ CHỦ ĐÍCH. Trả MỘT trong ba trạng thái (`JoinResultDto.state`), không coi "chưa tới lúc" là lỗi:
 * `WAITING_FOR_HOST` (chưa LIVE) · `IN_LOBBY` (chờ duyệt) · `JOINED` (token LiveKit theo quyền). Thứ tự kiểm: trạng thái/nền tảng → bị mời ra →
 * phòng chờ → bận (`call:busy`) → vào NGUYÊN TỬ (khoá/đầy/bị chặn dưới `call:lock`) → token. Vai trò/quyền phát luôn do SERVER quyết định.
 */
export class MeetingRoomJoinService {
  constructor(
    private readonly d: MeetingRoomDeps,
    private readonly access: MeetingRoomAccess,
    private readonly signals: MeetingRoomSignals
  ) {}

  /** `preloaded`: `start` vừa cập nhật cuộc họp — dùng bản mới, khỏi đọc lại. */
  async join(user: AuthUser, meetingId: string, dto: JoinMeetingDto, preloaded?: MeetingEntity): Promise<JoinResultDto> {
    const meeting = preloaded ?? (await this.d.repo.findById(meetingId));
    if (!meeting) throw meetNotFound();
    if (meeting.status === "CANCELLED" || meeting.status === "ENDED") throw meetError(ErrorCode.MEET_009, 409);
    if (meeting.platform !== "INTERNAL") throw meetError(ErrorCode.MEET_010, 409);
    const actor = await this.access.load(meeting, user.id);
    if (actor.removed) throw meetError(ErrorCode.MEET_013, 403);
    const now = this.d.now();
    if (meeting.status === "SCHEDULED") return this.waiting(meeting, actor, now);
    return this.joinLive(user, meeting, actor, dto, now);
  }

  private waiting(meeting: MeetingEntity, actor: RoomActor, now: Date): JoinResultDto {
    const opens = joinOpensAt(meeting);
    if (now.getTime() < opens.getTime()) throw meetError(ErrorCode.MEET_012, 409, { joinOpensAt: opens.toISOString() });
    if (!actor.scheduleHostLike && now.getTime() > meeting.endAt.getTime()) throw meetError(ErrorCode.MEET_006, 409);
    return { state: "WAITING_FOR_HOST", meetingId: meeting.id, joinOpensAt: opens.toISOString(), startAt: meeting.startAt.toISOString(), serverNow: now.toISOString() };
  }

  private async joinLive(user: AuthUser, meeting: MeetingEntity, actor: RoomActor, dto: JoinMeetingDto, now: Date): Promise<JoinResultDto> {
    const call = meeting.currentCallId ? await this.d.calls.findCall(meeting.currentCallId) : null;
    if (!call || call.status === "ENDED") throw meetError(ErrorCode.MEET_009, 409);
    const mine = await this.d.calls.findParticipant(call.id, user.id);
    if (mine?.state === "REMOVED") throw meetError(ErrorCode.MEET_013, 403);

    const admitted = await this.d.store.isAdmitted(call.id, user.id);
    const gate = await this.lobbyGate(user, meeting, call, actor, mine, admitted, dto, now);
    if (gate) return gate;

    if (actor.category === "GUEST_LINK") await this.ensureLinkAttendee(meeting, user.id);
    await this.d.calls.claimBusy(user, call.id, dto.force);
    const limits = await this.d.limits();
    const role: RoomRole = actor.category === "HOST" ? "HOST" : actor.category === "CO_HOST" ? "CO_HOST" : "MEMBER";
    // (p2-06) Đang ghi hình mà người này CHƯA đồng ý → vào phòng KHÔNG có quyền phát (chỉ nghe/xem) tới khi đồng ý qua `POST .../recordings/consent`.
    const activeRec = await this.d.recordings.findActiveByCall(call.id);
    const res = await this.d.calls.enter({
      callId: call.id,
      userId: user.id,
      deviceId: dto.deviceId,
      role,
      publish: MeetingTokenPolicy.publishFor({ role, recording: activeRec ? { active: true, consented: activeRec.consentSnapshot.some((c) => c.userId === user.id) } : null }),
      maxParticipants: limits.maxParticipants,
      bypassCapacity: actor.scheduleHostLike,
      locked: !!meeting.lockedAt,
      bypassLock: actor.isHostLike || admitted,
      rejoinAfterLockSeconds: LIMITS.meeting.rejoinAfterLockSeconds,
      force: dto.force,
    });
    if (res.kind !== "OK") {
      // Đang ở phòng này bằng thiết bị khác thì khoá bận thuộc về phiên đó — không nhả.
      if (!isInRoom(mine)) await this.d.calls.releaseBusy(user.id, call.id);
      throw this.enterError(res.kind);
    }
    if (admitted) await this.d.store.clearAdmitted(call.id, user.id);
    await this.d.store.removeLobby(meeting.id, user.id);
    return this.joined(user, meeting, call, res.participant, role, dto, now);
  }

  /**
   * Phòng chờ (be.md §5.2 bước 5): `ALL` ⇒ mọi người trừ chủ trì/đồng chủ trì; `NON_ATTENDEES` ⇒ chỉ người vào qua link (thành viên workspace
   * ngoài danh sách). Bỏ qua khi đã được duyệt (`meet:admitted`, TTL 10 phút) hoặc là người từng ở phòng này (rớt mạng vào lại).
   */
  private async lobbyGate(user: AuthUser, meeting: MeetingEntity, call: RoomCall, actor: RoomActor, mine: RoomParticipant | null, admitted: boolean, dto: JoinMeetingDto, now: Date): Promise<JoinResultDto | null> {
    if (actor.isHostLike || admitted) return null;
    const need = meeting.lobbyMode === "ALL" || (meeting.lobbyMode === "NON_ATTENDEES" && actor.category === "GUEST_LINK");
    if (!need) return null;
    if (mine && (isInRoom(mine) || (mine.firstJoinedAt && withinSeconds(mine.lastLeftAt, now, LIMITS.meeting.lobbyRejoinSeconds)))) return null;
    if (await this.d.store.isDenied(call.id, user.id)) throw meetError(ErrorCode.MEET_017, 403);

    const profile = (await this.d.dir.getUsers([user.id])).get(user.id);
    const displayName = dto.displayName ?? profile?.name ?? user.name ?? "";
    const requestedAt = now.toISOString();
    const added = await this.d.store.addLobby(meeting.id, { userId: user.id, displayName, requestedAt, deviceId: dto.deviceId });
    let at = requestedAt;
    if (added) await this.signals.lobbyToHosts(meeting, "REQUESTED", user.id, { displayName });
    else at = (await this.d.store.listLobby(meeting.id)).find((e) => e.userId === user.id)?.requestedAt ?? requestedAt;
    return { state: "IN_LOBBY", meetingId: meeting.id, requestedAt: at, serverNow: now.toISOString() };
  }

  private enterError(kind: "ENDED" | "BLOCKED" | "LOCKED" | "FULL" | "OTHER_DEVICE"): AppError {
    switch (kind) {
      case "BLOCKED":
        return meetError(ErrorCode.MEET_013, 403);
      case "LOCKED":
        return meetError(ErrorCode.MEET_007, 403);
      case "FULL":
        return meetError(ErrorCode.MEET_018, 409);
      case "OTHER_DEVICE":
        return new AppError(ErrorMessages[ErrorCode.CALL_004], 409, ErrorCode.CALL_004, { sameCallOtherDevice: true });
      default:
        return meetError(ErrorCode.MEET_009, 409);
    }
  }

  private async joined(user: AuthUser, meeting: MeetingEntity, call: RoomCall, entered: RoomParticipant, role: RoomRole, dto: JoinMeetingDto, now: Date): Promise<JoinResultDto> {
    // (p2-06) Bản ghi có thể vừa bắt đầu SAU lần đọc ở trên nhưng TRƯỚC `enter` (cùng `call:lock` nên không xen giữa): đọc lại rồi hạ quyền phát nếu chưa đồng ý.
    let participant = entered;
    const recNow = await this.d.recordings.findActiveByCall(call.id);
    if (recNow && !recNow.consentSnapshot.some((c) => c.userId === user.id) && (participant.publishPermissions.audio || participant.publishPermissions.video || participant.publishPermissions.screen)) {
      participant = (await this.d.calls.setPublishPermissions(call.id, user.id, MeetingTokenPolicy.publishFor({ role, recording: { active: true, consented: false } }))) ?? participant;
    }
    // Tên hiển thị của token = tên người dùng chọn ở pre-join (không phải email); vẫn là SERVER ký, identity luôn là userId.
    const token = await this.d.calls.issueToken(dto.displayName ? { ...user, name: dto.displayName } : user, call.id);
    return {
      state: "JOINED",
      meetingId: meeting.id,
      callId: call.id,
      livekitUrl: token.livekitUrl,
      livekitRoom: call.livekitRoom,
      token: token.token,
      tokenExpiresAt: token.expiresAt,
      role: sessionRole(participant.role),
      publishPermissions: participant.publishPermissions,
      recording: await roomRecordingState(this.d, call.id, user.id),
      lockedAt: meeting.lockedAt ? meeting.lockedAt.toISOString() : null,
      closingAt: await this.d.store.getClosingAt(call.id),
      conversationId: meeting.conversationId,
      serverNow: now.toISOString(),
    };
  }

  /**
   * Người vào qua link lần đầu → `MeetingAttendee { source: JOINED_VIA_LINK }` để điểm danh/biên bản/nhóm chat (be.md §5.2 bước 8). Tạo NGOÀI
   * transaction vào phòng (hai lượt cùng lúc → P2002 làm hỏng transaction, không "bắt rồi đi tiếp" trong đó — chỉ bắt ở đây, sau khi nó đã
   * huỷ hẳn). Vượt `attendeesMax` ⇒ vẫn cho vào, chỉ không ghi điểm danh.
   */
  private async ensureLinkAttendee(meeting: MeetingEntity, userId: string): Promise<void> {
    const existing = await this.d.repo.findAttendee(meeting.id, userId);
    if (existing && !existing.removedAt) return;
    const limits = await this.d.limits();
    try {
      await this.d.tx.run(async (tx) => {
        if (!(await this.d.repo.adjustAttendeeCount(tx, meeting.id, 1, limits.attendeesMax))) return;
        await this.d.repo.createAttendees(tx, [
          { meetingId: meeting.id, workspaceId: meeting.workspaceId, userId, role: "ATTENDEE", rsvp: "ACCEPTED", rsvpAt: this.d.now(), source: "JOINED_VIA_LINK", invitedBy: null, meetingStartAt: meeting.startAt, meetingEndAt: meeting.endAt, meetingStatus: "LIVE" },
        ]);
        const cur = await this.d.repo.findById(meeting.id, { tx });
        await this.d.outbox.add(tx, meetingEvents.attendeesChanged({ meetingId: meeting.id, version: cur?.version ?? meeting.version + 1, actorId: null, added: [{ userId, role: "ATTENDEE" }], removed: [], wasLive: true, viaLink: true }));
      });
    } catch (err) {
      if (!(err instanceof AttendeeConflictError)) throw err; // lượt song song đã tạo hàng này
    }
  }
}
