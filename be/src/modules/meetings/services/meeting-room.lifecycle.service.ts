import { LIMITS } from "../../../core/constants/limits";
import { VersionConflictError } from "../../../core/exceptions";
import type { AuthUser } from "../../../core/types/express";
import { ErrorCode } from "../../../core/utils/error.codes";
import { newObjectId } from "../../../core/utils/object-id";
import { logger } from "../../../infrastructure/logger";
import { roomNames } from "../../../infrastructure/media";
import type { EndMeetingDto, StartMeetingDto } from "../dtos";
import type { MeetingEndReasonValue, MeetingEntity } from "../entities/meeting.interface";
import type { JoinResultDto } from "../entities/meeting-room.interface";
import type { MeetingRuntimeLimits } from "./meeting.deps";
import { joinOpensAt } from "./meeting-actions.calculator";
import { RoomCallConflictError } from "./meeting-call.port";
import { meetError, meetNotFound, workspaceReadonly } from "./meeting-errors";
import { meetingEvents } from "./meeting-events";
import type { MeetingRoomAccess } from "./meeting-room.access";
import type { MeetingRoomDeps } from "./meeting-room.deps";
import type { MeetingRoomJoinService } from "./meeting-room.join.service";
import { autoCloseAt, autoCloseEvents, callEndReasonOf } from "./meeting-room.schedule";
import type { MeetingRoomSignals } from "./meeting-room.signals";

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Vòng đời phiên họp (be.md §5.1, §5.4): `start` (SCHEDULED/ENDED → LIVE), `end`/`endBySystem` (LIVE → ENDED). Ba tầng chống chạy chồng: khoá
 * `call:active:MEETING:<id>` (Redis) → CAS `Meeting.version + status` → `Call.activeKey @unique` (Mongo). Bên thua luôn quay về `join` phiên của bên thắng.
 * `Meeting.status` và `Call.status` đổi CÙNG transaction khi bắt đầu; khi kết thúc `Meeting` đổi trước (transaction), `Call` kết thúc sau commit
 * (`afterEnded`, chạy lại idempotent ở handler outbox + cron `meeting.room-reconcile`).
 */
export class MeetingRoomLifecycleService {
  constructor(
    private readonly d: MeetingRoomDeps,
    private readonly access: MeetingRoomAccess,
    private readonly signals: MeetingRoomSignals,
    private readonly joiner: MeetingRoomJoinService
  ) {}

  async start(user: AuthUser, meetingId: string, dto: StartMeetingDto): Promise<JoinResultDto> {
    const meeting = await this.d.repo.findById(meetingId);
    if (!meeting) throw meetNotFound();
    if (meeting.platform !== "INTERNAL") throw meetError(ErrorCode.MEET_010, 409);
    if (meeting.status === "CANCELLED") throw meetError(ErrorCode.MEET_009, 409);
    if (meeting.status === "LIVE") return this.joiner.join(user, meetingId, dto, meeting); // bấm "Bắt đầu" lần hai = vào phòng
    const ws = await this.d.dir.getWorkspace(meeting.workspaceId);
    if (!ws || ws.status !== "ACTIVE") throw workspaceReadonly();

    const now = this.d.now();
    const limits = await this.d.limits();
    if (meeting.status === "SCHEDULED") {
      const opens = joinOpensAt(meeting);
      if (now.getTime() < opens.getTime()) throw meetError(ErrorCode.MEET_012, 409, { joinOpensAt: opens.toISOString() });
    } else if (now.getTime() > meeting.endAt.getTime() + (limits.restartWindowMinutes ?? LIMITS.meeting.restartWindowMinutes) * 60_000) {
      throw meetError(ErrorCode.MEET_009, 409); // quá hạn "bắt đầu lại"
    }

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const callId = newObjectId();
      const lock = await this.d.calls.acquireActive(meeting.id, callId);
      if (!lock.acquired) {
        const live = await this.settleOther(meeting.id, lock.existing);
        if (live) return this.joiner.join(user, meetingId, dto, live);
        continue; // khoá mồ côi đã được nhả: thử lại
      }
      let started: MeetingEntity | null;
      try {
        started = await this.commitStart(user, meeting, callId, dto, limits, now);
      } catch (err) {
        await this.d.calls.releaseActive(meeting.id, callId);
        throw err;
      }
      if (started) return this.joiner.join(user, meetingId, dto, started);

      await this.d.calls.releaseActive(meeting.id, callId);
      const fresh = await this.d.repo.findById(meetingId);
      if (fresh?.status === "LIVE") return this.joiner.join(user, meetingId, dto, fresh); // MR-02: người thứ hai vào cùng phòng
      if (!fresh || fresh.status === "CANCELLED") throw meetError(ErrorCode.MEET_009, 409);
      throw new VersionConflictError(fresh.version);
    }
    throw meetError(ErrorCode.MEET_009, 409);
  }

  /** Một tiến trình khác đang/đã bắt đầu: chờ ngắn cho `Meeting` thành LIVE; khoá không còn ứng với phiên nào thì nhả (`null`). */
  private async settleOther(meetingId: string, existingCallId: string): Promise<MeetingEntity | null> {
    for (let i = 0; i < 40; i += 1) {
      const fresh = await this.d.repo.findById(meetingId);
      if (fresh?.status === "LIVE") return fresh;
      const call = await this.d.calls.findCall(existingCallId);
      if (call?.status === "ENDED" || (!call && i >= 20)) break;
      await sleep(50);
    }
    await this.d.calls.releaseActive(meetingId, existingCallId);
    return null;
  }

  private async commitStart(user: AuthUser, meeting: MeetingEntity, callId: string, dto: StartMeetingDto, limits: MeetingRuntimeLimits, now: Date): Promise<MeetingEntity | null> {
    const restarted = meeting.status === "ENDED";
    // Bắt đầu lại ⇒ phòng LiveKit MỚI (`Call.livekitRoom` là unique, phiên cũ vẫn giữ tên `meet_<mã>`).
    const livekitRoom = restarted ? `${roomNames.meeting(meeting.code)}_${callId.slice(-8)}` : roomNames.meeting(meeting.code);
    await this.createRoom(livekitRoom, callId, meeting, limits.maxParticipants);

    let cur: MeetingEntity | null;
    try {
      cur = await this.d.tx.run(async (tx) => {
        const updated = await this.d.repo.updateMeeting(
          tx,
          meeting.id,
          dto.expectedVersion,
          { status: "LIVE", startedAt: meeting.startedAt ?? now, currentCallId: callId, endedAt: null, endReason: null, lockedAt: null },
          { statusIn: ["SCHEDULED", "ENDED"] }
        );
        if (!updated) return null;
        await this.d.calls.createRoomCall(tx, { callId, meetingId: meeting.id, workspaceId: meeting.workspaceId, livekitRoom, initiatorId: user.id });
        await this.d.repo.updateAttendeesDenorm(tx, meeting.id, { meetingStatus: "LIVE" });
        await this.d.outbox.add(tx, meetingEvents.started({ meetingId: meeting.id, version: updated.version, callId, startedBy: user.id, restarted }));
        for (const ev of autoCloseEvents({ meetingId: meeting.id, callId, closeAt: autoCloseAt(updated, now, { maxMinutes: limits.maxMinutes, restartWindowMinutes: limits.restartWindowMinutes ?? LIMITS.meeting.restartWindowMinutes }), now })) await this.d.outbox.add(tx, ev);
        return updated;
      });
    } catch (err) {
      if (err instanceof RoomCallConflictError) return null; // `activeKey` trùng: bên kia thắng
      throw err;
    }
    if (!cur) return null;
    await this.d.calls.promoteActive(meeting.id, callId);
    await this.d.audit.record({ actorId: user.id, action: "meeting.start", targetType: "Meeting", targetId: meeting.id, workspaceId: meeting.workspaceId, metadata: { callId, restarted } });
    await this.signals.started(cur, { callId, startedBy: user.id, restarted });
    return cur;
  }

  /** `createRoom` idempotent; thử lại 2 lần (LiveKit chập chờn) rồi để lỗi `MEDIA_*` (502/503) tới client — chưa ghi gì nên không cần bù. */
  private async createRoom(name: string, callId: string, meeting: MeetingEntity, maxParticipants: number): Promise<void> {
    for (let i = 0; ; i += 1) {
      try {
        await this.d.media().createRoom({
          name,
          emptyTimeoutSeconds: LIMITS.meeting.emptyRoomTimeoutSeconds,
          maxParticipants: maxParticipants + LIMITS.meeting.roomSpareSlots,
          metadata: JSON.stringify({ v: 1, meetingId: meeting.id, callId }),
        });
        return;
      } catch (err) {
        if (i >= 2) throw err;
        await sleep(150 * (i + 1));
      }
    }
  }

  /** `end` — chủ trì/đồng chủ trì (lịch hoặc phiên). Idempotent: đã ENDED → trả nguyên trạng. */
  async end(user: AuthUser, meetingId: string, dto: EndMeetingDto): Promise<MeetingEntity> {
    const meeting = await this.d.repo.findById(meetingId);
    if (!meeting) throw meetNotFound();
    this.access.assertHostLike(await this.access.load(meeting, user.id));
    if (meeting.status === "ENDED") return meeting;
    if (meeting.status !== "LIVE") throw meetError(ErrorCode.MEET_009, 409);
    const ended = await this.commitEnd(meeting, "HOST_ENDED", user.id, dto.expectedVersion);
    if (!ended) return (await this.d.repo.findById(meetingId)) ?? meeting;
    await this.d.audit.record({ actorId: user.id, action: "meeting.end", targetType: "Meeting", targetId: meeting.id, workspaceId: meeting.workspaceId, metadata: { callId: meeting.currentCallId } });
    return ended;
  }

  /**
   * Hệ thống kết thúc (phòng trống, quá giờ, workspace lưu trữ, admin). `null` = không còn LIVE (idempotent). `opts.actorId` (p2-07 force-end): người
   * kết thúc là admin nền tảng — ghi vào `Call.endedBy`/payload `meeting.ended`, và KHÔNG ghi thêm audit `meeting.end-system` (endpoint admin đã ghi
   * `meeting.force-end` kèm lý do lúc nhận yêu cầu).
   */
  async endBySystem(meetingId: string, reason: MeetingEndReasonValue, opts: { actorId?: string } = {}): Promise<MeetingEntity | null> {
    const meeting = await this.d.repo.findById(meetingId, { includeDeleted: true });
    if (!meeting || meeting.status !== "LIVE") return null;
    const ended = await this.commitEnd(meeting, reason, opts.actorId ?? null);
    if (ended && !opts.actorId) {
      // `AuditPort.actorId` bắt buộc — ghi thay chủ trì, `system: true` phân biệt với thao tác của chính chủ trì.
      await this.d.audit.record({ actorId: meeting.hostId, action: "meeting.end-system", targetType: "Meeting", targetId: meeting.id, workspaceId: meeting.workspaceId, metadata: { reason, system: true, callId: meeting.currentCallId } });
    }
    return ended;
  }

  private async commitEnd(meeting: MeetingEntity, reason: MeetingEndReasonValue, actorId: string | null, expectedVersion?: number): Promise<MeetingEntity | null> {
    const now = this.d.now();
    const call = meeting.currentCallId ? await this.d.calls.findCall(meeting.currentCallId) : null;
    const ended = await this.d.tx.run(async (tx) => {
      const updated = await this.d.repo.updateMeeting(tx, meeting.id, expectedVersion, { status: "ENDED", endedAt: now, endReason: reason, lockedAt: null }, { statusIn: ["LIVE"] });
      if (!updated) return null;
      await this.d.repo.updateAttendeesDenorm(tx, meeting.id, { meetingStatus: "ENDED" });
      await this.d.outbox.add(tx, meetingEvents.ended({ meetingId: meeting.id, version: updated.version, callId: call?.id ?? null, reason, actorId, startedAt: call?.startedAt.toISOString() ?? null }));
      return updated;
    });
    if (!ended) {
      if (expectedVersion !== undefined) {
        const fresh = await this.d.repo.findById(meeting.id);
        if (fresh?.status === "LIVE") throw new VersionConflictError(fresh.version);
      }
      return null;
    }
    // Dọn NGAY trong request (socket tới mọi người tức thì); lỗi thì handler outbox chạy lại — `afterEnded` idempotent.
    await this.afterEnded(ended, { callId: call?.id ?? null, reason, actorId }).catch((err: unknown) =>
      logger.warn("[meetings] Dọn sau khi kết thúc lỗi — handler outbox sẽ thử lại", { meetingId: meeting.id, error: err instanceof Error ? err.message : String(err) })
    );
    return ended;
  }

  /**
   * Sau khi `Meeting` đã ENDED: kết thúc `Call` (điểm DUY NHẤT `endCall`: `deleteRoom`, nhả khoá Redis, tính `connectedSeconds`), dọn phòng chờ,
   * báo `meeting:ended`, xếp điểm danh. Idempotent — `endCall` trên phiên đã kết thúc trả `null`. Ném lỗi để handler outbox thử lại.
   */
  async afterEnded(meeting: MeetingEntity, p: { callId: string | null; reason: MeetingEndReasonValue; actorId: string | null }): Promise<void> {
    let durationSec = 0;
    if (p.callId) {
      const ended = await this.d.calls.endCall(p.callId, callEndReasonOf(p.reason), p.actorId);
      durationSec = (ended ?? (await this.d.calls.findCall(p.callId)))?.durationSec ?? 0;
    }
    await this.d.store.clearLobby(meeting.id);
    this.signals.ended(meeting, { callId: p.callId, reason: p.reason, durationSec });
    if (p.callId) await this.d.roomJobs.enqueueAttendanceFinalize({ meetingId: meeting.id, callId: p.callId });
  }
}
