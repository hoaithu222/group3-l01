import { LIMITS } from "../../../core/constants/limits";
import { avatarUrlOf } from "../../../shared/media";
import type { AttendeeDto, AttendeeEntity, MeetingDetailDto, MeetingEntity, MeetingListItemDto, MeetingRsvpValue } from "../entities/meeting.interface";
import type { MeetingUserInfo, WorkspaceRoleValue } from "../repositories/meeting-directory.reader";
import { computeMyActions, joinOpensAt, type ActionFlags } from "./meeting-actions.calculator";

const ZERO_RSVP: Record<MeetingRsvpValue, number> = { PENDING: 0, ACCEPTED: 0, DECLINED: 0, TENTATIVE: 0 };
const iso = (d: Date | null): string | undefined => (d ? d.toISOString() : undefined);

export interface MapContext {
  attendee: AttendeeEntity | null;
  wsRole: WorkspaceRoleValue | null;
  now: Date;
  flags?: ActionFlags;
  /** Cửa sổ "bắt đầu lại" HIỆU LỰC (`limits.meeting.restartWindowMinutes` runtime) — thiếu = `LIMITS.meeting`. */
  restartWindowMinutes?: number;
}

/** Dựng DTO cuộc họp. `isMetadataOnly` = người xem không tham dự và cuộc họp `visibility = ATTENDEES` (OWNER/ADMIN workspace). */
export class MeetingDtoMapper {
  private restart = LIMITS.meeting.restartWindowMinutes;

  toListItem(m: MeetingEntity, c: MapContext): MeetingListItemDto {
    const member = c.attendee && !c.attendee.removedAt ? c.attendee : null;
    return {
      id: m.id,
      workspaceId: m.workspaceId,
      code: m.code,
      title: m.title,
      status: m.status,
      startAt: m.startAt.toISOString(),
      endAt: m.endAt.toISOString(),
      timezone: m.timezone,
      format: m.format,
      platform: m.platform,
      hostId: m.hostId,
      attendeeCount: m.attendeeCount,
      myRole: member?.role ?? null,
      myRsvp: member?.rsvp ?? null,
      isMetadataOnly: !member && m.visibility === "ATTENDEES",
      myActions: computeMyActions(m, member, c.wsRole, c.now, { restartWindowMinutes: c.restartWindowMinutes ?? this.restart, flags: c.flags }),
      joinOpensAt: joinOpensAt(m).toISOString(),
      version: m.version,
    };
  }

  /** Chi tiết: bản metadata (không agenda/địa điểm/link/danh sách vai) cho người chỉ được xem metadata. */
  toDetail(m: MeetingEntity, c: MapContext, extra: { rsvpSummary?: Record<MeetingRsvpValue, number>; coHostIds?: string[] } = {}): MeetingDetailDto {
    const base = this.toListItem(m, c);
    const detail = !base.isMetadataOnly;
    const hostLike = base.myRole === "HOST" || base.myRole === "CO_HOST";
    return {
      ...base,
      ...(detail && m.agenda ? { agenda: m.agenda } : {}),
      ...(detail && m.location ? { location: m.location } : {}),
      ...(detail && m.externalUrl ? { externalUrl: m.externalUrl } : {}),
      visibility: m.visibility,
      lobbyMode: m.lobbyMode,
      joinWindowMinutes: m.joinWindowMinutes,
      reminderMinutes: detail ? m.reminderMinutes : [],
      notifyVia: m.notifyVia,
      recapRequired: m.recapRequired,
      recordingAllowed: m.recordingAllowed,
      ...(detail && m.conversationId ? { conversationId: m.conversationId } : {}),
      ...(m.currentCallId ? { currentCallId: m.currentCallId } : {}),
      ...(m.lockedAt ? { lockedAt: iso(m.lockedAt) } : {}),
      ...(m.startedAt ? { startedAt: iso(m.startedAt) } : {}),
      ...(m.endedAt ? { endedAt: iso(m.endedAt) } : {}),
      ...(m.endReason ? { endReason: m.endReason } : {}),
      ...(m.cancelReason ? { cancelReason: m.cancelReason } : {}),
      rsvpSummary: hostLike ? (extra.rsvpSummary ?? ZERO_RSVP) : ZERO_RSVP,
      coHostIds: detail ? (extra.coHostIds ?? []) : [],
      hasPublishedRecap: c.flags?.hasPublishedRecap ?? false,
      readyRecordingCount: c.flags?.readyRecordingCount ?? 0,
      serverNow: c.now.toISOString(),
    };
  }

  toAttendee(a: AttendeeEntity, profile: Pick<MeetingUserInfo, "name" | "avatarAssetId"> | undefined): AttendeeDto {
    return {
      userId: a.userId,
      name: profile?.name ?? "",
      // URL ảnh ký sẵn (bản THUMB) — `null` khi chưa đặt ảnh, đã ẩn danh hoá (`avatarAssetId` bị xoá) hoặc không còn tài khoản.
      avatarUrl: avatarUrlOf(profile?.avatarAssetId),
      role: a.role,
      rsvp: a.rsvp,
      rsvpAt: a.rsvpAt ? a.rsvpAt.toISOString() : null,
      source: a.source,
      invitedAt: a.invitedAt.toISOString(),
    };
  }
}
