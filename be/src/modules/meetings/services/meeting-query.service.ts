import { LIMITS } from "../../../core/constants/limits";
import type { AuthUser } from "../../../core/types/express";
import { decodeCursor, encodeCursor } from "../../../core/utils/cursor";
import type { AttendeesQueryDto, MeetingRangeQueryDto } from "../dtos";
import type { AttendeeDto, AttendeeEntity, MeetingDetailDto, MeetingEntity, MeetingListItemDto, ResolveResult } from "../entities/meeting.interface";
import type { WorkspaceRoleValue } from "../repositories/meeting-directory.reader";
import type { MeetingDeps } from "./meeting.deps";
import { computeMyActions } from "./meeting-actions.calculator";
import { MeetingDtoMapper } from "./meeting-dto.mapper";
import { meetNotFound } from "./meeting-errors";

export interface AttendeesPage {
  items: AttendeeDto[];
  nextCursor: string | null;
  hasMore: boolean;
}

/** Đọc lịch họp (be.md §5.6): chi tiết, lịch cá nhân, lịch workspace, danh sách người tham dự, resolve mã họp. */
export class MeetingQueryService {
  constructor(
    private readonly d: MeetingDeps,
    private readonly mapper: MeetingDtoMapper = new MeetingDtoMapper(),
    /** (p2-05) Người này đã bị mời ra khỏi PHIÊN họp hiện tại — `myActions.canJoin` tắt (`ActionFlags.blockedFromCall`). Bỏ trống = không ai bị chặn. */
    private readonly isBlocked?: (meeting: MeetingEntity, userId: string) => Promise<boolean>
  ) {}

  /** `limits.meeting.restartWindowMinutes` HIỆU LỰC (admin chỉnh được) — dùng cho `myActions.canStart` của cuộc họp ENDED. */
  private async restartWindow(): Promise<number> {
    return (await this.d.limits()).restartWindowMinutes ?? LIMITS.meeting.restartWindowMinutes;
  }

  private range(q: MeetingRangeQueryDto) {
    return { from: q.from, to: q.to, statuses: q.status, limit: LIMITS.meeting.rangeListMax };
  }

  /** Chi tiết cho người ĐÃ qua `requireScope("meeting.read")` — `meeting.detail.read` quyết định bản đầy đủ hay metadata. */
  async getDetail(user: AuthUser, meetingId: string): Promise<MeetingDetailDto> {
    const meeting = await this.d.repo.findById(meetingId);
    if (!meeting) throw meetNotFound();
    const [attendee, roles, restartWindowMinutes] = await Promise.all([this.d.repo.findAttendee(meetingId, user.id), this.d.dir.getActiveMemberRoles(meeting.workspaceId, [user.id]), this.restartWindow()]);
    const active = attendee && !attendee.removedAt ? attendee : null;
    const wsRole = roles.get(user.id) ?? null;
    const isHostLike = active?.role === "HOST" || active?.role === "CO_HOST";
    const [rsvpSummary, attendees] = await Promise.all([isHostLike ? this.d.repo.countRsvp(meetingId) : undefined, active || meeting.visibility === "WORKSPACE" ? this.d.repo.findActiveAttendees(meetingId) : []]);
    const coHostIds = attendees.filter((a) => a.role === "CO_HOST").map((a) => a.userId);
    const blockedFromCall = meeting.status === "LIVE" && !!this.isBlocked ? await this.isBlocked(meeting, user.id) : false;
    // (p2-06) Cờ biên bản/ghi hình cho `myActions` (nút "Xem biên bản"/"Viết biên bản") và `hasPublishedRecap`/`readyRecordingCount`.
    const [recap, ready] = await Promise.all([this.d.recaps.findByMeetingId(meetingId), this.d.recordings.readyCountsByMeeting([meetingId])]);
    const flags = { blockedFromCall, hasPublishedRecap: !!recap?.publishedAt, readyRecordingCount: ready.get(meetingId) ?? 0, isRecapAuthor: !!recap && recap.authorId === user.id };
    return this.mapper.toDetail(meeting, { attendee: active, wsRole, now: this.d.now(), restartWindowMinutes, flags }, { rsvpSummary, coHostIds });
  }

  /** `/me/meetings`: `MINE` = tôi tham dự; `ALL_VISIBLE` = thêm cuộc họp `visibility = WORKSPACE` của các workspace tôi thuộc. */
  async listMine(user: AuthUser, q: MeetingRangeQueryDto): Promise<MeetingListItemDto[]> {
    const now = this.d.now();
    const restartWindowMinutes = await this.restartWindow();
    const workspaces = await this.d.dir.getMyActiveWorkspaces(user.id);
    const roleOf = new Map<string, WorkspaceRoleValue>(workspaces.map((w) => [w.workspaceId, w.role]));
    const filter = this.range(q);

    const mine = (await this.d.repo.listMine(user.id, { ...filter, workspaceId: q.workspaceId })).filter((r) => roleOf.has(r.meeting.workspaceId));
    const items = new Map<string, { meeting: MeetingEntity; attendee: AttendeeEntity | null }>(mine.map((r) => [r.meeting.id, r]));

    if (q.scope === "ALL_VISIBLE") {
      const wsIds = workspaces.filter((w) => w.role !== "GUEST" && (!q.workspaceId || w.workspaceId === q.workspaceId)).map((w) => w.workspaceId);
      const visible = await this.d.repo.listWorkspaceVisible(wsIds, filter);
      for (const meeting of visible) if (!items.has(meeting.id)) items.set(meeting.id, { meeting, attendee: null });
    }
    return [...items.values()]
      .sort((a, b) => a.meeting.startAt.getTime() - b.meeting.startAt.getTime())
      .slice(0, LIMITS.meeting.rangeListMax)
      .map(({ meeting, attendee }) => this.mapper.toListItem(meeting, { attendee, wsRole: roleOf.get(meeting.workspaceId) ?? null, now, restartWindowMinutes }));
  }

  /** `/workspaces/:id/meetings`: cuộc họp tôi tham dự + `WORKSPACE`; OWNER/ADMIN thấy thêm phần còn lại dạng metadata. */
  async listWorkspace(user: AuthUser, workspaceId: string, q: MeetingRangeQueryDto): Promise<MeetingListItemDto[]> {
    const now = this.d.now();
    const restartWindowMinutes = await this.restartWindow();
    const wsRole = (await this.d.dir.getActiveMemberRoles(workspaceId, [user.id])).get(user.id) ?? null;
    if (!wsRole) return [];
    const all = await this.d.repo.listByWorkspace(workspaceId, this.range(q));
    const attendeeByMeeting = new Map((await this.d.repo.findAttendeeRows(all.map((m) => m.id), user.id)).map((a) => [a.meetingId, a]));
    const isAdmin = wsRole === "OWNER" || wsRole === "ADMIN";
    return all
      .filter((m) => attendeeByMeeting.has(m.id) || (m.visibility === "WORKSPACE" && wsRole !== "GUEST") || isAdmin)
      .map((m) => this.mapper.toListItem(m, { attendee: attendeeByMeeting.get(m.id) ?? null, wsRole, now, restartWindowMinutes }));
  }

  /** Danh sách người tham dự (cursor tăng dần) — quyền `meeting.detail.read` đã kiểm ở route. Không trả email. */
  async listAttendees(meetingId: string, q: AttendeesQueryDto): Promise<AttendeesPage> {
    const cursor = q.cursor ? decodeCursor(q.cursor) : null;
    const rows = await this.d.repo.listAttendeesPage(meetingId, { cursor: cursor ?? undefined, limit: q.limit });
    const hasMore = rows.length > q.limit;
    const page = rows.slice(0, q.limit);
    const users = await this.d.dir.getUsers(page.map((a) => a.userId));
    const last = page[page.length - 1];
    return {
      items: page.map((a) => this.mapper.toAttendee(a, users.get(a.userId))),
      hasMore,
      nextCursor: hasMore && last ? encodeCursor(last.invitedAt, last.id) : null,
    };
  }

  /**
   * `GET /meetings/resolve/:code` (be.md §5.6): người không đủ quyền chỉ nhận `NOT_AVAILABLE` trung tính (không lộ tiêu đề/tồn tại
   * mã) — chống dò mã. Attendee bị xoá khỏi danh sách mới nhận `REMOVED`.
   */
  async resolve(user: AuthUser, code: string): Promise<ResolveResult> {
    const notAvailable: ResolveResult = { allowed: false, reason: "NOT_AVAILABLE" };
    const meeting = await this.d.repo.findByCode(code);
    if (!meeting) return notAvailable;
    const wsRole = (await this.d.dir.getActiveMemberRoles(meeting.workspaceId, [user.id])).get(user.id);
    if (!wsRole) return notAvailable;
    const attendee = await this.d.repo.findAttendee(meeting.id, user.id);
    if (attendee?.removedAt) return { allowed: false, reason: "REMOVED" };
    const member = attendee ?? null;
    const isAdmin = wsRole === "OWNER" || wsRole === "ADMIN";
    const canSee = !!member || (meeting.visibility === "WORKSPACE" && wsRole !== "GUEST") || isAdmin;
    if (!canSee) return notAvailable;

    const base = { allowed: true as const, meetingId: meeting.id, status: meeting.status };
    if (meeting.status === "CANCELLED") return { ...base, target: "DETAIL" };
    const actions = computeMyActions(meeting, member, wsRole, this.d.now(), { restartWindowMinutes: await this.restartWindow() });
    if (actions.canJoin) return { ...base, target: actions.joinVia === "LOBBY" ? "LOBBY" : "JOIN" };
    return { ...base, target: "DETAIL" };
  }
}
