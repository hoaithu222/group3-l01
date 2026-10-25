import { ValidationError, VersionConflictError } from "../../../core/exceptions";
import type { AuthUser } from "../../../core/types/express";
import { isValidMeetingExternalUrl } from "../../../core/constants/meeting-platforms";
import { LIMITS } from "../../../core/constants/limits";
import { ErrorCode } from "../../../core/utils/error.codes";
import { graphemeLength, normalizeSearch } from "../../../core/utils/normalize";
import { newObjectId } from "../../../core/utils/object-id";
import type { CancelMeetingDto, CreateMeetingDto, DeleteMeetingQueryDto, UpdateMeetingDto } from "../dtos";
import type { AttendeeEntity, MeetingEntity, MeetingPatch, NewAttendee } from "../entities/meeting.interface";
import { MeetingCodeConflictError } from "../repositories/meeting.repository.interface";
import type { MeetingDeps, MeetingRuntimeLimits } from "./meeting.deps";
import { meetError, meetNotFound, reasonRequired, workspaceReadonly } from "./meeting-errors";
import { meetingEvents } from "./meeting-events";
import { nextMeetingCode } from "./meeting-code.generator";

/** Trường đổi → cần gửi lại `.ics` (be.md §5.2 bước 6). */
const ICS_FIELDS = ["startAt", "endAt", "timezone", "location", "platform", "externalUrl", "title"] as const;
/** Trường đổi → push `meeting.updated` (đổi khác chỉ socket). */
const NOTIFY_FIELDS = ["startAt", "endAt", "timezone", "location", "platform", "externalUrl"] as const;
/** LIVE: chỉ các trường này còn sửa được (README §2 "Sửa theo trạng thái"). */
const LIVE_EDITABLE = new Set(["title", "agenda", "endAt", "lobbyMode"]);
const MIN_EXTEND_MS = 5 * 60_000;

const sameValue = (a: unknown, b: unknown): boolean => {
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v, i) => v === b[i]);
  return (a ?? null) === (b ?? null);
};

/**
 * Trần độ dài tiêu đề/nội dung do admin hạ qua `limits.meeting` (SystemConfig) — DTO Zod chỉ kiểm TRẦN CỨNG (`LIMITS.meeting`), giá trị runtime thấp
 * hơn kiểm ở đây. Lỗi `VAL_001` kèm `details` theo trường (cùng dạng `validateBody`). Chỉ kiểm trường được gửi VÀ đổi: hạ trần không làm
 * cuộc họp cũ (đã dài hơn) không sửa được các trường khác.
 */
function assertTextLimits(limits: MeetingRuntimeLimits, fields: { title?: string; agenda?: string | null }): void {
  const titleMax = limits.titleMax ?? LIMITS.meeting.titleMax;
  const agendaMax = limits.agendaMax ?? LIMITS.meeting.agendaMax;
  const errors: Record<string, string[]> = {};
  if (fields.title !== undefined && graphemeLength(fields.title) > titleMax) errors.title = [`Tiêu đề tối đa ${titleMax} ký tự`];
  if (fields.agenda && graphemeLength(fields.agenda) > agendaMax) errors.agenda = [`Nội dung tối đa ${agendaMax} ký tự`];
  if (Object.keys(errors).length > 0) throw new ValidationError("Dữ liệu không hợp lệ", errors);
}

/** Nhắc: bỏ trùng, sắp giảm dần, cắt theo trần runtime. */
const cleanReminders = (list: number[], max: number): number[] => [...new Set(list)].sort((x, y) => y - x).slice(0, max);

/** `MeetingService` (be.md §5.1–§5.4): tạo/sửa/huỷ/xoá mềm/chuyển chủ trì. Sau commit mọi việc nền đi qua outbox `meeting.events`. */
export class MeetingService {
  constructor(private readonly d: MeetingDeps) {}

  async create(actor: AuthUser, workspaceId: string, dto: CreateMeetingDto): Promise<MeetingEntity> {
    const workspace = await this.d.dir.getWorkspace(workspaceId);
    if (!workspace || workspace.status !== "ACTIVE") throw workspaceReadonly();
    const now = this.d.now();
    const limits = await this.d.limits();
    assertTextLimits(limits, { title: dto.title, agenda: dto.agenda });
    if (dto.startAt.getTime() < now.getTime() - LIMITS.meeting.startAtSkewSeconds * 1000) throw meetError(ErrorCode.MEET_004, 400);
    const externalUrl = this.checkExternal(dto.platform, dto.externalUrl);

    const userIds = [...new Set([...dto.attendeeIds, ...dto.coHostIds])].filter((id) => id !== actor.id);
    const roles = await this.d.dir.getActiveMemberRoles(workspaceId, userIds);
    const missing = userIds.filter((id) => !roles.has(id));
    if (missing.length > 0) throw meetError(ErrorCode.MEET_014, 400, { userIds: missing });
    if (userIds.length + 1 > limits.attendeesMax) throw meetError(ErrorCode.MEET_005, 409);

    const coHosts = new Set(dto.coHostIds);
    const meetingId = newObjectId();
    for (let attempt = 0; ; attempt += 1) {
      const code = await nextMeetingCode((c) => this.d.repo.codeExists(c));
      try {
        const created = await this.d.tx.run(async (tx) => {
          const meeting = await this.d.repo.createMeeting(tx, {
            id: meetingId,
            workspaceId,
            code,
            title: dto.title,
            normalizedTitle: normalizeSearch(dto.title),
            agenda: dto.agenda ?? null,
            format: dto.format,
            location: dto.location ?? null,
            platform: dto.platform,
            externalUrl,
            startAt: dto.startAt,
            endAt: dto.endAt,
            timezone: dto.timezone,
            seriesId: null,
            occurrenceIndex: null,
            isSeriesException: false,
            status: "SCHEDULED",
            hostId: actor.id,
            visibility: dto.visibility,
            lobbyMode: dto.lobbyMode,
            joinWindowMinutes: limits.joinWindowMinutes,
            reminderMinutes: cleanReminders(dto.reminderMinutes, limits.remindersMax),
            notifyVia: dto.notifyVia,
            recapRequired: dto.recapRequired,
            recordingAllowed: dto.recordingAllowed,
            createChatGroup: dto.createChatGroup,
            conversationId: null,
            currentCallId: null,
            lockedAt: null,
            startedAt: null,
            endedAt: null,
            endReason: null,
            cancelledAt: null,
            cancelledBy: null,
            cancelReason: null,
            deletedAt: null,
            deletedBy: null,
            attendeeCount: userIds.length + 1,
            createdBy: actor.id,
          });
          const base = { meetingId, workspaceId, source: "INVITED" as const, invitedBy: actor.id, meetingStartAt: dto.startAt, meetingEndAt: dto.endAt, meetingStatus: "SCHEDULED" as const };
          const attendees: NewAttendee[] = [
            { ...base, userId: actor.id, role: "HOST", rsvp: "ACCEPTED", rsvpAt: now },
            ...userIds.map<NewAttendee>((userId) => ({ ...base, userId, role: coHosts.has(userId) ? "CO_HOST" : "ATTENDEE", rsvp: "PENDING" })),
          ];
          await this.d.repo.createAttendees(tx, attendees);
          await this.d.outbox.add(tx, meetingEvents.created(meetingId, meeting.version));
          return meeting;
        });
        await this.d.audit.record({ actorId: actor.id, action: "meeting.create", targetType: "Meeting", targetId: meetingId, workspaceId });
        return created;
      } catch (err) {
        if (err instanceof MeetingCodeConflictError && attempt < 4) continue; // trùng mã đúng lúc: sinh lại
        throw err;
      }
    }
  }

  /** `platform ≠ INTERNAL` bắt buộc HTTPS + host thuộc allowlist (MEET_015); INTERNAL bỏ `externalUrl`. */
  private checkExternal(platform: CreateMeetingDto["platform"], url: string | undefined | null): string | null {
    if (platform === "INTERNAL") return null;
    if (!url || !isValidMeetingExternalUrl(platform, url)) throw meetError(ErrorCode.MEET_015, 400);
    return url;
  }

  async update(actor: AuthUser, meetingId: string, dto: UpdateMeetingDto): Promise<MeetingEntity> {
    const meeting = await this.d.repo.findById(meetingId);
    if (!meeting) throw meetNotFound();
    if (meeting.status === "ENDED" || meeting.status === "CANCELLED") throw meetError(ErrorCode.MEET_009, 409);
    const { expectedVersion, ...fields } = dto;
    const now = this.d.now();
    const limits = await this.d.limits();

    // Gộp giá trị mới vào bản hiện tại để kiểm ràng buộc chéo (thời gian, nền tảng/URL).
    const next = { ...meeting, ...Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined)) } as MeetingEntity;
    const patch: MeetingPatch = {};
    for (const [key, value] of Object.entries(fields)) {
      if (value === undefined) continue;
      if (!sameValue(value, (meeting as unknown as Record<string, unknown>)[key])) (patch as Record<string, unknown>)[key] = value;
    }
    const changedFields = Object.keys(patch);
    if (changedFields.length === 0) return meeting;
    assertTextLimits(limits, { title: patch.title, agenda: patch.agenda });

    if (meeting.status === "LIVE") {
      const forbidden = changedFields.filter((f) => !LIVE_EDITABLE.has(f));
      if (forbidden.length > 0) throw meetError(ErrorCode.MEET_009, 409, { fields: forbidden });
      if (patch.endAt && (patch.endAt.getTime() < now.getTime() + MIN_EXTEND_MS || patch.endAt <= meeting.startAt)) throw meetError(ErrorCode.MEET_003, 400);
    } else if (patch.startAt && patch.startAt.getTime() < now.getTime() - LIMITS.meeting.startAtSkewSeconds * 1000) {
      throw meetError(ErrorCode.MEET_004, 400);
    }
    if (next.endAt <= next.startAt || +next.endAt - +next.startAt > LIMITS.meeting.scheduleMaxDurationMinutes * 60_000) throw meetError(ErrorCode.MEET_003, 400);
    if (patch.platform !== undefined || patch.externalUrl !== undefined) {
      patch.externalUrl = this.checkExternal(next.platform, next.externalUrl);
      if (patch.platform === undefined && sameValue(patch.externalUrl, meeting.externalUrl)) delete patch.externalUrl;
    }
    if (next.format === "OFFLINE" && next.platform !== "INTERNAL") throw meetError(ErrorCode.MEET_015, 400);
    if (patch.title) patch.normalizedTitle = normalizeSearch(patch.title);
    if (patch.reminderMinutes) patch.reminderMinutes = cleanReminders(patch.reminderMinutes, limits.remindersMax);
    // Chuẩn hoá (URL, nhắc) có thể làm 1 trường thực ra không đổi → tính lại danh sách trường đổi cho sự kiện/audit.
    const finalFields = Object.keys(patch).filter((k) => k !== "normalizedTitle");
    if (finalFields.length === 0) return meeting;

    const timeChanged = patch.startAt !== undefined || patch.endAt !== undefined;
    const updated = await this.d.tx.run(async (tx) => {
      const cur = await this.d.repo.updateMeeting(tx, meetingId, expectedVersion, patch);
      if (!cur) return null;
      if (timeChanged) await this.d.repo.updateAttendeesDenorm(tx, meetingId, { meetingStartAt: cur.startAt, meetingEndAt: cur.endAt });
      await this.d.outbox.add(tx, meetingEvents.updated({
        meetingId,
        version: cur.version,
        oldVersion: meeting.version,
        changedFields: finalFields,
        oldReminderMinutes: meeting.reminderMinutes,
        oldStartAt: meeting.startAt.toISOString(),
        actorId: actor.id,
        icsRelevant: finalFields.some((f) => (ICS_FIELDS as readonly string[]).includes(f)),
        notifyRelevant: finalFields.some((f) => (NOTIFY_FIELDS as readonly string[]).includes(f)),
      }));
      return cur;
    });
    if (!updated) throw new VersionConflictError((await this.d.repo.findById(meetingId))?.version ?? meeting.version);
    await this.d.audit.record({ actorId: actor.id, action: "meeting.update", targetType: "Meeting", targetId: meetingId, workspaceId: meeting.workspaceId, metadata: { changedFields: finalFields } });
    return updated;
  }

  /** Vai trò của người thao tác trong cuộc họp: chủ trì/đồng chủ trì thật hay quản trị workspace. */
  private async actorContext(actorId: string, meeting: MeetingEntity): Promise<{ attendee: AttendeeEntity | null; hostLike: boolean; wsRole: string | undefined }> {
    const attendee = await this.d.repo.findAttendee(meeting.id, actorId);
    const active = attendee && !attendee.removedAt ? attendee : null;
    const wsRole = (await this.d.dir.getActiveMemberRoles(meeting.workspaceId, [actorId])).get(actorId);
    return { attendee: active, hostLike: active?.role === "HOST" || active?.role === "CO_HOST", wsRole };
  }

  async cancel(actor: AuthUser, meetingId: string, dto: CancelMeetingDto, system?: { reason: string }): Promise<MeetingEntity> {
    const meeting = await this.d.repo.findById(meetingId);
    if (!meeting) throw meetNotFound();
    if (meeting.status !== "SCHEDULED") throw meetError(ErrorCode.MEET_009, 409);
    const ctx = await this.actorContext(actor.id, meeting);
    const byAdmin = !ctx.hostLike;
    if (byAdmin && !dto.reason && !system) throw reasonRequired();
    const updated = await this.commitCancel(meeting, dto.expectedVersion, actor.id, dto.reason ?? system?.reason ?? null, { byAdmin, alsoDeleted: false, systemReason: system?.reason });
    await this.d.audit.record({
      actorId: actor.id,
      action: byAdmin ? "meeting.cancel-by-admin" : "meeting.cancel",
      targetType: "Meeting",
      targetId: meetingId,
      workspaceId: meeting.workspaceId,
      reason: dto.reason,
    });
    return updated;
  }

  /** Huỷ do HỆ THỐNG (workspace lưu trữ, chủ trì bị loại) — không kiểm vai trò người dùng, không audit theo người. */
  async cancelBySystem(meetingId: string, reason: "WORKSPACE_ARCHIVED" | "HOST_REMOVED"): Promise<MeetingEntity | null> {
    const meeting = await this.d.repo.findById(meetingId);
    if (!meeting || meeting.status !== "SCHEDULED") return null;
    return this.commitCancel(meeting, undefined, null, reason, { byAdmin: false, alsoDeleted: false, systemReason: reason });
  }

  private async commitCancel(
    meeting: MeetingEntity,
    expectedVersion: number | undefined,
    actorId: string | null,
    reason: string | null,
    flags: { byAdmin: boolean; alsoDeleted: boolean; systemReason?: string }
  ): Promise<MeetingEntity> {
    const now = this.d.now();
    const updated = await this.d.tx.run(async (tx) => {
      const cur = await this.d.repo.updateMeeting(tx, meeting.id, expectedVersion, {
        status: "CANCELLED",
        cancelledAt: now,
        cancelledBy: actorId,
        cancelReason: reason,
        ...(flags.alsoDeleted ? { deletedAt: now, deletedBy: actorId } : {}),
      });
      if (!cur) return null;
      await this.d.repo.updateAttendeesDenorm(tx, meeting.id, { meetingStatus: "CANCELLED" });
      await this.d.outbox.add(tx, meetingEvents.cancelled({
        actorId,
        meetingId: meeting.id,
        version: cur.version,
        byAdmin: flags.byAdmin,
        alsoDeleted: flags.alsoDeleted,
        oldReminderMinutes: meeting.reminderMinutes,
        systemReason: flags.systemReason,
      }));
      return cur;
    });
    if (!updated) throw new VersionConflictError((await this.d.repo.findById(meeting.id))?.version ?? meeting.version);
    return updated;
  }

  /**
   * Xoá MỀM (`deletedAt`) — be.md §5.4: SCHEDULED → huỷ (ICS CANCEL) rồi xoá; ENDED có biên bản đã công bố/ghi hình READY chỉ
   * OWNER workspace + lý do (MEET_016); LIVE → MEET_009.
   */
  async softDelete(actor: AuthUser, meetingId: string, q: DeleteMeetingQueryDto, data: { hasPublishedRecap?: boolean; readyRecordingCount?: number } = {}): Promise<void> {
    const meeting = await this.d.repo.findById(meetingId);
    if (!meeting) throw meetNotFound();
    if (meeting.status === "LIVE") throw meetError(ErrorCode.MEET_009, 409);
    const ctx = await this.actorContext(actor.id, meeting);
    const isHost = ctx.attendee?.role === "HOST";
    const isOwner = ctx.wsRole === "OWNER";
    // (p2-06) Dữ liệu thật: biên bản đã công bố / bản ghi READY chưa xoá (test đơn vị vẫn có thể truyền tường minh).
    const hasPublishedRecap = data.hasPublishedRecap ?? !!(await this.d.recaps.findByMeetingId(meetingId))?.publishedAt;
    const readyRecordingCount = data.readyRecordingCount ?? (await this.d.recordings.readyCountsByMeeting([meetingId])).get(meetingId) ?? 0;
    const hasData = meeting.status === "ENDED" && (hasPublishedRecap || readyRecordingCount > 0);
    if (hasData && !(isOwner && q.reason)) throw meetError(ErrorCode.MEET_016, 409);
    if (!isHost && !isOwner) throw meetError(ErrorCode.MEET_002, 403);

    if (meeting.status === "SCHEDULED") {
      await this.commitCancel(meeting, q.expectedVersion, actor.id, q.reason ?? null, { byAdmin: !isHost, alsoDeleted: true });
    } else {
      const now = this.d.now();
      const ok = await this.d.tx.run(async (tx) => {
        const cur = await this.d.repo.updateMeeting(tx, meetingId, q.expectedVersion, { deletedAt: now, deletedBy: actor.id });
        if (!cur) return false;
        await this.d.outbox.add(tx, meetingEvents.deleted(meetingId, cur.version));
        return true;
      });
      if (!ok) throw new VersionConflictError((await this.d.repo.findById(meetingId))?.version ?? meeting.version);
    }
    await this.d.audit.record({ actorId: actor.id, action: "meeting.delete", targetType: "Meeting", targetId: meetingId, workspaceId: meeting.workspaceId, reason: q.reason });
  }

  /** Chuyển chủ trì do HỆ THỐNG (chủ trì bị loại khỏi workspace): cho đồng chủ trì lâu nhất, không kiểm quyền người dùng, không CAS version. */
  async transferHostBySystem(meetingId: string, fromUserId: string, toUserId: string): Promise<MeetingEntity | null> {
    const meeting = await this.d.repo.findById(meetingId);
    if (!meeting || (meeting.status !== "SCHEDULED" && meeting.status !== "LIVE") || meeting.hostId !== fromUserId) return null;
    const updated = await this.d.tx.run(async (tx) => {
      const target = await this.d.repo.findAttendee(meetingId, toUserId, tx);
      if (!target || target.removedAt) return null;
      const cur = await this.d.repo.updateMeeting(tx, meetingId, undefined, { hostId: toUserId });
      if (!cur) return null;
      await this.d.repo.updateAttendee(tx, meetingId, fromUserId, { role: "CO_HOST" });
      await this.d.repo.updateAttendee(tx, meetingId, toUserId, { role: "HOST" });
      await this.d.outbox.add(tx, meetingEvents.hostTransferred(meetingId, cur.version, fromUserId, toUserId));
      return cur;
    });
    if (updated) await this.d.audit.record({ actorId: fromUserId, action: "meeting.transfer-host", targetType: "Meeting", targetId: meetingId, workspaceId: meeting.workspaceId, metadata: { toUserId, reason: "HOST_REMOVED" } });
    return updated;
  }

  /** `transferHost` (be.md §5.5): HOST cũ → CO_HOST, người nhận → HOST, `Meeting.hostId`, `version + 1` — một transaction. */
  async transferHost(actor: AuthUser, meetingId: string, toUserId: string, expectedVersion: number): Promise<MeetingEntity> {
    const meeting = await this.d.repo.findById(meetingId);
    if (!meeting) throw meetNotFound();
    if (meeting.status === "ENDED" || meeting.status === "CANCELLED") throw meetError(ErrorCode.MEET_009, 409);
    if (meeting.hostId !== actor.id) throw meetError(ErrorCode.MEET_002, 403);
    if (toUserId === actor.id) throw meetError(ErrorCode.MEET_014, 400);
    const updated = await this.d.tx.run(async (tx) => {
      const target = await this.d.repo.findAttendee(meetingId, toUserId, tx);
      if (!target || target.removedAt) return "NOT_ATTENDEE" as const;
      const cur = await this.d.repo.updateMeeting(tx, meetingId, expectedVersion, { hostId: toUserId });
      if (!cur) return null;
      await this.d.repo.updateAttendee(tx, meetingId, actor.id, { role: "CO_HOST" });
      await this.d.repo.updateAttendee(tx, meetingId, toUserId, { role: "HOST" });
      await this.d.outbox.add(tx, meetingEvents.hostTransferred(meetingId, cur.version, actor.id, toUserId));
      return cur;
    });
    if (updated === "NOT_ATTENDEE") throw meetError(ErrorCode.MEET_014, 400);
    if (!updated) throw new VersionConflictError((await this.d.repo.findById(meetingId))?.version ?? meeting.version);
    await this.d.audit.record({ actorId: actor.id, action: "meeting.transfer-host", targetType: "Meeting", targetId: meetingId, workspaceId: meeting.workspaceId, metadata: { toUserId } });
    return updated;
  }
}
