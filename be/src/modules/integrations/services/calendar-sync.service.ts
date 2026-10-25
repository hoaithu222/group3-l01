import { AppError } from "../../../core/exceptions";
import { ErrorCode } from "../../../core/utils/error.codes";
import type { UserIntegrationEntity } from "../entities/integration.interface";
import { intErrors } from "../integrations.errors";
import type { CalendarEventInput, ICalendarClient } from "../providers/google-calendar.provider";
import { ProviderAuthError, type TokenSet } from "../providers/provider.interface";
import type { ICalendarLinkRepository } from "../repositories/calendar-link.repository.interface";
import type { IUserIntegrationRepository } from "../repositories/user-integration.repository.interface";
import type { CalendarMeetingInfo, CalendarSyncJob, IIntegrationJobs, IMeetingCalendarReader } from "./integration.ports";
import type { IntegrationStatusService } from "./integration-status.service";
import type { ProviderAvailability } from "./provider-availability";
import type { TokenService } from "./token.service";

const PROVIDER = "GOOGLE_CALENDAR" as const;
/** Sự kiện `meeting.events` (p2-04) làm đổi thứ hiện trên lịch của người tham dự. Các sự kiện phòng họp/biên bản bỏ qua. */
const RELEVANT_EVENTS = new Set(["created", "updated", "cancelled", "deleted", "attendees-changed"]);
const BACKFILL_MAX = 50;
const CLEANUP_BATCH = 100;
const DESCRIPTION_MAX = 4000;

export type SyncOutcome = "SYNCED" | "DELETED" | "SKIPPED" | "REVOKED";

export interface CalendarSyncDeps {
  userIntegrations: IUserIntegrationRepository;
  calendarLinks: ICalendarLinkRepository;
  meetings: IMeetingCalendarReader;
  calendar: ICalendarClient;
  tokens: Pick<TokenService, "userTokens" | "refreshUser">;
  status: Pick<IntegrationStatusService, "markUserRevoked">;
  jobs: Pick<IIntegrationJobs, "enqueueCalendarSync">;
  availability: Pick<ProviderAvailability, "isEnabled">;
  /** Liên kết mở cuộc họp trong Super App (`<web>/m/<mã>`, cùng dạng email `.ics`). */
  meetingUrl: (code: string) => string;
  revokeRemote?: (tokens: TokenSet) => Promise<void>;
  now: () => Date;
}

/** Trạng thái mong muốn trên lịch của MỘT người: có sự kiện / không có / để nguyên (họp đã kết thúc — giữ lịch sử). */
function desiredState(meeting: CalendarMeetingInfo | null, userId: string): "UPSERT" | "DELETE" | "KEEP" {
  if (!meeting || meeting.deleted || meeting.status === "CANCELLED") return "DELETE";
  if (!meeting.attendeeIds.includes(userId)) return "DELETE";
  return meeting.status === "ENDED" ? "KEEP" : "UPSERT";
}

const isRevoked = (err: unknown): boolean => err instanceof AppError && err.errorCode === ErrorCode.INT_010;

/**
 * Đẩy cuộc họp Super App lên Google Calendar cá nhân — MỘT CHIỀU, idempotent (README §2, INT-07). Sink `meeting.events` chỉ XẾP job
 * `calendar.sync-meeting` cho từng người (jobId theo `(họp, người, version)`); job đọc lại trạng thái HIỆN TẠI của cuộc họp (không tin payload) nên
 * sự kiện tới lệch thứ tự vẫn hội tụ, và bỏ qua khi `CalendarEventLink.syncedVersion ≥ version`. Id sự kiện Google tất định theo (họp, người) nên chèn
 * lặp không tạo hai sự kiện. 401 → làm mới token rồi thử lại MỘT lần; `invalid_grant`/403 → kết nối `REVOKED` + `INTEGRATION_ERROR` (không thử lại).
 */
export class CalendarSyncService {
  constructor(private readonly d: CalendarSyncDeps) {}

  /** Sink `integrations.calendar` của `meeting.events`: xếp job UPSERT cho người đã nối lịch, DELETE cho người có sự kiện nhưng không còn thuộc cuộc họp. */
  async onMeetingEvent(p: { event: string; meetingId: string; version: number }): Promise<number> {
    if (!RELEVANT_EVENTS.has(p.event) || !(await this.d.availability.isEnabled(PROVIDER))) return 0;
    const meeting = await this.d.meetings.getMeeting(p.meetingId);
    if (meeting?.status === "ENDED" && !meeting.deleted) return 0;
    const version = Math.max(p.version, meeting?.version ?? 0);
    const wanted = meeting && !meeting.deleted && meeting.status !== "CANCELLED" ? meeting.attendeeIds : [];
    const connected = wanted.length > 0 ? await this.d.userIntegrations.findActiveByUserIds(wanted, PROVIDER) : [];
    const upsert = new Set(connected.map((u) => u.userId));
    const remove = (await this.d.calendarLinks.listLiveByMeeting(p.meetingId)).map((l) => l.userId).filter((id) => !upsert.has(id));
    const jobs: CalendarSyncJob[] = [
      ...[...upsert].map((userId) => ({ meetingId: p.meetingId, userId, version, change: "UPSERT" as const })),
      ...remove.map((userId) => ({ meetingId: p.meetingId, userId, version, change: "DELETE" as const })),
    ];
    for (const job of jobs) await this.d.jobs.enqueueCalendarSync(job);
    return jobs.length;
  }

  /** Ngay sau khi nối lịch: đưa các cuộc họp sắp tới của người dùng lên lịch (tối đa 50). */
  async backfillUpcoming(userId: string): Promise<number> {
    const upcoming = await this.d.meetings.listUpcomingForUser(userId, this.d.now(), BACKFILL_MAX);
    for (const m of upcoming) await this.d.jobs.enqueueCalendarSync({ meetingId: m.meetingId, userId, version: m.version, change: "UPSERT" });
    return upcoming.length;
  }

  /** Job `calendar.sync-meeting`. Lỗi tạm thời (mạng/5xx/429) ném lên để BullMQ thử lại; thu hồi → `REVOKED` (không thử lại). */
  async syncMeeting(job: CalendarSyncJob): Promise<SyncOutcome> {
    const ui = await this.d.userIntegrations.findByUserProvider(job.userId, PROVIDER);
    if (!ui || ui.status !== "ACTIVE" || !ui.credentials || !(await this.d.availability.isEnabled(PROVIDER))) return "SKIPPED";
    const [meeting, link] = await Promise.all([this.d.meetings.getMeeting(job.meetingId), this.d.calendarLinks.find(job.meetingId, job.userId)]);
    const version = Math.max(job.version, meeting?.version ?? 0);
    if (link && link.syncedVersion >= version) return "SKIPPED";
    const desired = desiredState(meeting, job.userId);
    if (desired === "KEEP") return "SKIPPED";
    // Liên kết của tài khoản Google cũ (đã đổi tài khoản) không còn là sự kiện trên lịch hiện tại.
    const current = link && !link.deletedAt && link.userIntegrationId === ui.id ? link : null;
    try {
      if (desired === "DELETE") {
        if (!current) return "SKIPPED";
        await this.withTokens(ui, (tokens) => this.d.calendar.deleteEvent(tokens, ui.calendarId, current.externalEventId));
        await this.d.calendarLinks.markDeleted(current.id, version);
        return "DELETED";
      }
      const input = this.eventInput(meeting as CalendarMeetingInfo, job.userId);
      const existing = current ? { externalEventId: current.externalEventId, etag: current.etag } : null;
      const ref = await this.withTokens(ui, (tokens) => this.d.calendar.upsertEvent(tokens, ui.calendarId, input, existing));
      await this.d.calendarLinks.upsert({ meetingId: job.meetingId, userId: job.userId, userIntegrationId: ui.id, externalEventId: ref.externalEventId, etag: ref.etag, syncedVersion: version });
      return "SYNCED";
    } catch (err) {
      if (isRevoked(err)) return "REVOKED";
      throw err;
    }
  }

  /**
   * Job `calendar.cleanup-user` sau khi người dùng ngắt kết nối (`DISABLED`): xoá sự kiện của các cuộc họp CHƯA kết thúc trên lịch Google (best-effort),
   * thu hồi token, xoá liên kết + kết nối. Người dùng đã nối lại trong lúc chờ (ACTIVE) → bỏ qua.
   */
  async cleanupUser(userIntegrationId: string): Promise<"CLEANED" | "SKIPPED"> {
    const ui = await this.d.userIntegrations.findById(userIntegrationId);
    if (!ui || ui.status === "ACTIVE") return "SKIPPED";
    let tokens: TokenSet | null = null;
    try {
      tokens = ui.credentials ? await this.d.tokens.userTokens(ui) : null;
    } catch (err) {
      if (!isRevoked(err)) throw err;
    }
    if (tokens) {
      const now = this.d.now().getTime();
      const links = await this.d.calendarLinks.listLiveByUserIntegration(ui.id, CLEANUP_BATCH);
      const ends = await this.d.meetings.endTimes(links.map((l) => l.meetingId));
      for (const link of links) {
        const endAt = ends.get(link.meetingId);
        if (!endAt || endAt.getTime() <= now) continue; // cuộc họp đã qua: giữ lại trên lịch như lịch sử
        try {
          await this.d.calendar.deleteEvent(tokens, ui.calendarId, link.externalEventId);
        } catch (err) {
          if (!(err instanceof ProviderAuthError)) throw err;
          break; // token đã bị thu hồi phía Google — không xoá được nữa, dọn phía mình
        }
      }
      await this.d.revokeRemote?.(tokens).catch(() => undefined);
    }
    await this.d.calendarLinks.deleteByUserIntegration(ui.id);
    await this.d.userIntegrations.delete(ui.id);
    return "CLEANED";
  }

  private eventInput(meeting: CalendarMeetingInfo, userId: string): CalendarEventInput {
    const url = this.d.meetingUrl(meeting.code);
    const description = [meeting.agenda?.trim(), `Mở cuộc họp trong Super App: ${url}`, meeting.externalUrl ? `Liên kết họp: ${meeting.externalUrl}` : null]
      .filter((s): s is string => Boolean(s))
      .join("\n\n")
      .slice(0, DESCRIPTION_MAX);
    return {
      meetingId: meeting.id,
      userId,
      title: meeting.title,
      description,
      ...(meeting.location ? { location: meeting.location } : {}),
      startAt: meeting.startAt,
      endAt: meeting.endAt,
      timezone: meeting.timezone,
      url,
    };
  }

  /** Gọi Google với token còn hạn; 401 → làm mới rồi thử lại đúng MỘT lần; 401 lần hai hoặc 403 → `REVOKED` + thông báo, ném `INT_010`. */
  private async withTokens<T>(ui: UserIntegrationEntity, run: (tokens: TokenSet) => Promise<T>): Promise<T> {
    try {
      return await run(await this.d.tokens.userTokens(ui));
    } catch (err) {
      if (!(err instanceof ProviderAuthError)) throw err;
      if (err.code !== "unauthorized") {
        await this.d.status.markUserRevoked(ui, "TOKEN_INVALID");
        throw intErrors.revoked();
      }
    }
    if ((await this.d.tokens.refreshUser(ui.id)) !== "REFRESHED") throw intErrors.revoked();
    const fresh = await this.d.userIntegrations.findById(ui.id);
    if (!fresh || fresh.status !== "ACTIVE") throw intErrors.revoked();
    try {
      return await run(await this.d.tokens.userTokens(fresh));
    } catch (err) {
      if (err instanceof ProviderAuthError) {
        await this.d.status.markUserRevoked(fresh, "TOKEN_INVALID");
        throw intErrors.revoked();
      }
      throw err;
    }
  }
}
