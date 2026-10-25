import { ValidationError } from "../../../core/exceptions";
import type { AuthUser } from "../../../core/types/express";
import { ErrorCode } from "../../../core/utils/error.codes";
import type { LeaveMeetingDto } from "../dtos";
import type { MeetingHostControlService } from "./meeting-host-control.service";
import { meetError, meetNotFound } from "./meeting-errors";
import { isInRoom, type MeetingRoomAccess } from "./meeting-room.access";
import type { MeetingRoomDeps } from "./meeting-room.deps";
import type { MeetingRoomMaintenanceService } from "./meeting-room.maintenance.service";
import type { MeetingRoomSignals } from "./meeting-room.signals";

/**
 * `POST /meetings/:id/leave` (be.md §5.3): rời phòng, tuỳ chọn GIAO QUYỀN (`transferControlTo` → `CO_HOST` phiên) trước khi rời. Idempotent — rời
 * hai lần, rời khi cuộc họp đã kết thúc, hoặc chỉ đang ở phòng chờ đều 204. Rời phòng chờ = huỷ yêu cầu xin vào.
 */
export class MeetingRoomLeaveService {
  constructor(
    private readonly d: MeetingRoomDeps,
    private readonly access: MeetingRoomAccess,
    private readonly signals: MeetingRoomSignals,
    private readonly hostControl: MeetingHostControlService,
    private readonly maintenance: MeetingRoomMaintenanceService
  ) {}

  async leave(user: AuthUser, meetingId: string, dto: LeaveMeetingDto): Promise<void> {
    const meeting = await this.d.repo.findById(meetingId);
    if (!meeting) throw meetNotFound();
    if (await this.d.store.removeLobby(meetingId, user.id)) await this.signals.lobbyToHosts(meeting, "CANCELLED", user.id, { reason: "CANCELLED" });

    const callId = meeting.status === "LIVE" ? meeting.currentCallId : null;
    const call = callId ? await this.d.calls.findCall(callId) : null;
    const mine = call && callId ? await this.d.calls.findParticipant(callId, user.id) : null;
    if (!call || call.status === "ENDED" || !mine || !isInRoom(mine)) return;

    const actor = await this.access.load(meeting, user.id);
    if (dto.transferControlTo) {
      if (!actor.isHostLike) throw meetError(ErrorCode.MEET_002, 403);
      if (dto.transferControlTo === user.id) throw new ValidationError("Không thể giao quyền cho chính bạn", { transferControlTo: ["Chọn người khác"] });
      const target = await this.d.calls.findParticipant(call.id, dto.transferControlTo);
      if (!target || !isInRoom(target)) throw meetError(ErrorCode.MEET_020, 404);
      const scheduled = (await this.d.repo.findAttendee(meeting.id, target.userId))?.role;
      const alreadyHostLike = scheduled === "HOST" || scheduled === "CO_HOST" || target.role === "HOST" || target.role === "CO_HOST";
      if (!alreadyHostLike) {
        await this.hostControl.applyRole(meeting, call, user.id, target.userId, "CO_HOST");
        await this.hostControl.audit(user, meeting, "meeting.transfer-control", { callId: call.id, targetUserId: target.userId, onLeave: true });
      }
    }
    await this.d.calls.leave(user, call.id);
    if (actor.isHostLike) await this.maintenance.scheduleGraceIfHeadless(meeting, call.id, user.id);
  }
}
