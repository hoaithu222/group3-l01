import { LIMITS } from "../../../core/constants/limits";
import type { AuthUser } from "../../../core/types/express";
import { ErrorCode } from "../../../core/utils/error.codes";
import { SocketEvent } from "../../../infrastructure/socket/socket.events";
import type { AddAttendeesDto } from "../dtos";
import type { AttendeeEntity, MeetingEntity, MeetingRsvpValue, NewAttendee } from "../entities/meeting.interface";
import { AttendeeConflictError } from "../repositories/meeting.repository.interface";
import type { MeetingDeps } from "./meeting.deps";
import { meetError, meetNotFound } from "./meeting-errors";
import { meetingEvents } from "./meeting-events";

export interface AddAttendeesResult {
  added: string[];
  alreadyAttending: string[];
  rejected: Array<{ userId: string; code: string }>;
}

/** `MeetingAttendeeService` (be.md §5.5): thêm/xoá/tự rút/đổi vai trò/RSVP. Danh sách người tham dự ĐÓNG BĂNG khi ENDED/CANCELLED. */
export class MeetingAttendeeService {
  constructor(private readonly d: MeetingDeps) {}

  private async load(meetingId: string, allowed: Array<MeetingEntity["status"]>): Promise<MeetingEntity> {
    const meeting = await this.d.repo.findById(meetingId);
    if (!meeting) throw meetNotFound();
    if (!allowed.includes(meeting.status)) throw meetError(ErrorCode.MEET_009, 409);
    return meeting;
  }

  private async activeAttendee(meetingId: string, userId: string): Promise<AttendeeEntity | null> {
    const a = await this.d.repo.findAttendee(meetingId, userId);
    return a && !a.removedAt ? a : null;
  }

  async add(actor: AuthUser, meetingId: string, dto: AddAttendeesDto): Promise<AddAttendeesResult> {
    const meeting = await this.load(meetingId, ["SCHEDULED", "LIVE"]);
    const me = await this.activeAttendee(meetingId, actor.id);
    if (dto.role === "CO_HOST" && me?.role !== "HOST") throw meetError(ErrorCode.MEET_002, 403); // cấp đồng chủ trì = việc của HOST

    const limits = await this.d.limits();
    const ids = [...new Set(dto.userIds)].filter((id) => id !== actor.id);
    const roles = await this.d.dir.getActiveMemberRoles(meeting.workspaceId, ids);
    const result: AddAttendeesResult = { added: [], alreadyAttending: [], rejected: [] };

    const out = await this.withConflictRetry(() => this.d.tx.run(async (tx) => {
      const local: AddAttendeesResult = { added: [], alreadyAttending: [], rejected: [] };
      const fresh: NewAttendee[] = [];
      const restore: string[] = [];
      for (const userId of ids) {
        if (!roles.has(userId)) {
          local.rejected.push({ userId, code: ErrorCode.MEET_014 });
          continue;
        }
        const existing = await this.d.repo.findAttendee(meetingId, userId, tx);
        if (existing && !existing.removedAt) local.alreadyAttending.push(userId);
        else if (existing) restore.push(userId);
        else fresh.push({ meetingId, workspaceId: meeting.workspaceId, userId, role: dto.role, rsvp: "PENDING", source: "INVITED", invitedBy: actor.id, meetingStartAt: meeting.startAt, meetingEndAt: meeting.endAt, meetingStatus: meeting.status });
      }
      const count = fresh.length + restore.length;
      if (count === 0) return { local, version: null as number | null };

      // Trần người tham dự kiểm NGUYÊN TỬ trong cùng lệnh tăng `attendeeCount` — hai lượt thêm đồng thời không vượt trần.
      if (!(await this.d.repo.adjustAttendeeCount(tx, meetingId, count, limits.attendeesMax))) throw meetError(ErrorCode.MEET_005, 409);
      await this.d.repo.createAttendees(tx, fresh);
      const now = this.d.now();
      for (const userId of restore) {
        await this.d.repo.updateAttendee(tx, meetingId, userId, { removedAt: null, removedBy: null, role: dto.role, rsvp: "PENDING", rsvpAt: null, source: "INVITED", invitedBy: actor.id, invitedAt: now, meetingStartAt: meeting.startAt, meetingEndAt: meeting.endAt, meetingStatus: meeting.status });
      }
      local.added.push(...fresh.map((f) => f.userId), ...restore);
      const cur = await this.d.repo.findById(meetingId, { tx });
      const version = cur?.version ?? meeting.version + 1;
      await this.d.outbox.add(tx, meetingEvents.attendeesChanged({ meetingId, version, actorId: actor.id, added: local.added.map((userId) => ({ userId, role: dto.role })), removed: [], wasLive: meeting.status === "LIVE" }));
      return { local, version };
    }));
    result.added = out.local.added;
    result.alreadyAttending = out.local.alreadyAttending;
    result.rejected = out.local.rejected;
    return result;
  }

  /** Hai lượt thêm cùng một người đồng thời: lượt thua gặp P2002 → chạy lại, lần sau thấy `alreadyAttending`. */
  private async withConflictRetry<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      if (!(err instanceof AttendeeConflictError)) throw err;
      return fn();
    }
  }

  /** Xoá người tham dự (chủ trì/đồng chủ trì); LIVE → outbox `wasLive` để p2-05 loại khỏi phòng và chặn vào lại phiên đó. */
  async remove(actor: AuthUser, meetingId: string, userId: string): Promise<void> {
    const meeting = await this.load(meetingId, ["SCHEDULED", "LIVE"]);
    const me = await this.activeAttendee(meetingId, actor.id);
    const target = await this.activeAttendee(meetingId, userId);
    if (!target) throw meetNotFound();
    if (target.role === "HOST") throw meetError(ErrorCode.MEET_016, 409);
    if (target.role === "CO_HOST" && me?.role !== "HOST") throw meetError(ErrorCode.MEET_002, 403); // CO_HOST không xoá được HOST/CO_HOST
    await this.commitRemoval(meeting, userId, actor.id);
  }

  /** Tự rút khỏi danh sách (SCHEDULED). HOST phải chuyển chủ trì trước (`MEET_016`). */
  async leaveSelf(actor: AuthUser, meetingId: string): Promise<void> {
    const meeting = await this.load(meetingId, ["SCHEDULED"]);
    const me = await this.activeAttendee(meetingId, actor.id);
    if (!me) throw meetNotFound();
    if (me.role === "HOST") throw meetError(ErrorCode.MEET_016, 409);
    await this.commitRemoval(meeting, actor.id, actor.id);
  }

  /** Dùng chung cho xoá/tự rút/lifecycle hệ thống (`removedBy = null`). Trả `true` khi thật sự có người bị bỏ. */
  async commitRemoval(meeting: MeetingEntity, userId: string, removedBy: string | null): Promise<boolean> {
    return this.d.tx.run(async (tx) => {
      const target = await this.d.repo.findAttendee(meeting.id, userId, tx);
      if (!target || target.removedAt) return false;
      await this.d.repo.updateAttendee(tx, meeting.id, userId, { removedAt: this.d.now(), removedBy });
      await this.d.repo.adjustAttendeeCount(tx, meeting.id, -1, LIMITS.meeting.attendeesMax);
      const cur = await this.d.repo.findById(meeting.id, { tx });
      await this.d.outbox.add(tx, meetingEvents.attendeesChanged({ meetingId: meeting.id, version: cur?.version ?? meeting.version + 1, actorId: removedBy, added: [], removed: [userId], wasLive: meeting.status === "LIVE" }));
      return true;
    });
  }

  async setRole(actor: AuthUser, meetingId: string, userId: string, role: "CO_HOST" | "ATTENDEE"): Promise<AttendeeEntity> {
    const meeting = await this.load(meetingId, ["SCHEDULED", "LIVE"]);
    if (meeting.hostId !== actor.id) throw meetError(ErrorCode.MEET_002, 403);
    const target = await this.activeAttendee(meetingId, userId);
    if (!target) throw meetNotFound();
    if (target.role === "HOST") throw meetError(ErrorCode.MEET_016, 409);
    const active = await this.d.repo.findActiveAttendees(meetingId);
    if (role === "CO_HOST" && target.role !== "CO_HOST" && active.filter((a) => a.role === "CO_HOST").length >= LIMITS.meeting.coHostsMax) throw meetError(ErrorCode.MEET_005, 409);
    if (target.role === role) return target;

    const updated = await this.d.tx.run(async (tx) => {
      const row = await this.d.repo.updateAttendee(tx, meetingId, userId, { role });
      const cur = await this.d.repo.updateMeeting(tx, meetingId, undefined, {}); // version + 1 để dedupeKey của sự kiện duy nhất
      await this.d.outbox.add(tx, meetingEvents.rolesChanged(meetingId, cur?.version ?? meeting.version + 1, actor.id, [userId]));
      return row;
    });
    return updated ?? target;
  }

  /** RSVP chỉ THÔNG TIN (không chặn vào phòng), không tăng `Meeting.version`; chủ trì nhận tổng hợp qua socket. */
  async rsvp(actor: AuthUser, meetingId: string, rsvp: MeetingRsvpValue): Promise<{ rsvp: MeetingRsvpValue; rsvpAt: Date }> {
    const meeting = await this.load(meetingId, ["SCHEDULED", "LIVE"]);
    const me = await this.activeAttendee(meetingId, actor.id);
    if (!me) throw meetNotFound();
    const rsvpAt = this.d.now();
    await this.d.repo.updateAttendee(undefined, meetingId, actor.id, { rsvp, rsvpAt });
    const [summary, attendees] = await Promise.all([this.d.repo.countRsvp(meetingId), this.d.repo.findActiveAttendees(meetingId)]);
    const hostIds = attendees.filter((a) => a.role === "HOST" || a.role === "CO_HOST").map((a) => a.userId);
    this.d.emitter.toUsers(hostIds, SocketEvent.MEETING_UPDATED, { meetingId, version: meeting.version, changedFields: ["rsvp"], status: meeting.status, rsvpSummary: summary });
    return { rsvp, rsvpAt };
  }
}
