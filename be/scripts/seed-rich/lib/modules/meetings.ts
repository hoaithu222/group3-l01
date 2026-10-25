/**
 * Seed phân hệ HỌP (`meetings`): cuộc họp sắp tới / đã kết thúc (có biên bản công bố) / đã huỷ, chuỗi họp hằng tuần và thông báo họp cho `thu`.
 *
 * Ghi đúng như `MeetingService`/`MeetingAttendeeService`/`MeetingRecapService` tự ghi (đọc từ mã thật): `attendeeCount` = số người đang tham dự,
 * `meetingStartAt/EndAt/meetingStatus` trên người tham dự = lịch của cuộc họp, đúng một HOST, mọi trường lọc bằng null ghi null tường minh,
 * biên bản `version` tăng theo mỗi lần lưu/công bố (`publishedVersion` = version sau khi công bố). KHÔNG tạo Call/LiveKit/ghi hình/nhóm chat
 * (`currentCallId = null`, `createChatGroup = false`, `conversationId = null`), không phát outbox/push/ICS; thông báo ghi thẳng, `pushStatus = SKIPPED`.
 * Idempotent: mọi bản ghi gốc dùng id tất định theo khoá (`stableId`) và người tham dự/biên bản kiểm theo khoá tự nhiên.
 */
import type { Prisma } from "@prisma/client";
import { normalizeSearch } from "../../../../src/core/utils/normalize";
import { MIN_MS, prisma } from "../core";
import type { ModuleSeed } from "../module-ctx";
import type { ResolvedMeeting, ResolvedSeries } from "./meetings.resolve";
import { resolveAll } from "./meetings.resolve";
import { mixedRng } from "./mpq-util";

const CODE_ALPHABET = "abcdefghjkmnpqrstuvwxyz"; // khớp `MEETING_CODE_ALPHABET` của backend (bỏ i, l, o)

/** Mã họp `abc-defg-hij` tất định theo khoá; trùng với cuộc họp khác thì đổi muối. */
async function uniqueCode(key: string): Promise<string> {
  for (let salt = 0; ; salt += 1) {
    const rng = mixedRng(`meeting-code:${key}:${salt}`);
    const pick = (n: number) => Array.from({ length: n }, () => CODE_ALPHABET[Math.floor(rng() * CODE_ALPHABET.length)]).join("");
    const code = `${pick(3)}-${pick(4)}-${pick(3)}`;
    if (!(await prisma.meeting.findUnique({ where: { code }, select: { id: true } }))) return code;
  }
}

const TIMEZONE = "Asia/Ho_Chi_Minh";

function meetingData(m: ResolvedMeeting, code: string): Prisma.MeetingUncheckedCreateInput {
  const external = m.where && "platform" in m.where ? m.where : null;
  const physical = m.where && "format" in m.where ? m.where : null;
  return {
    id: m.id,
    workspaceId: m.ws.id,
    code,
    title: m.title,
    normalizedTitle: normalizeSearch(m.title),
    agenda: m.agenda,
    format: physical?.format ?? "ONLINE",
    location: physical?.location ?? null,
    platform: external?.platform ?? "INTERNAL",
    externalUrl: external?.url ?? null,
    startAt: m.startAt,
    endAt: m.endAt,
    timezone: TIMEZONE,
    seriesId: m.series?.id ?? null,
    occurrenceIndex: m.series?.index ?? null,
    isSeriesException: m.series?.exception ?? false,
    status: m.state,
    hostId: m.hostId,
    visibility: m.open ? "WORKSPACE" : "ATTENDEES",
    lobbyMode: "NON_ATTENDEES",
    joinWindowMinutes: 10,
    reminderMinutes: m.remind,
    notifyVia: "APP",
    recapRequired: m.recapRequired,
    recordingAllowed: true,
    createChatGroup: false,
    conversationId: null,
    currentCallId: null,
    lockedAt: null,
    startedAt: m.startedAt,
    endedAt: m.endedAt,
    endReason: m.endReason,
    cancelledAt: m.cancel?.at ?? null,
    cancelledBy: m.cancel?.by ?? null,
    cancelReason: m.cancel?.reason ?? null,
    deletedAt: null,
    deletedBy: null,
    attendeeCount: m.attendees.length,
    createdBy: m.hostId,
    version: m.version,
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
  };
}

interface Stats {
  meetings: number;
  attendees: number;
  recaps: number;
  published: number;
  series: number;
  notifications: number;
}

async function writeMeeting(m: ResolvedMeeting, stats: Stats): Promise<void> {
  const isNew = !(await prisma.meeting.findUnique({ where: { id: m.id }, select: { id: true } }));
  if (isNew) {
    await prisma.meeting.create({ data: meetingData(m, await uniqueCode(m.key)) });
    stats.meetings += 1;
  }
  const have = new Set((await prisma.meetingAttendee.findMany({ where: { meetingId: m.id }, select: { userId: true } })).map((r) => r.userId));
  const missing = m.attendees.filter((a) => !have.has(a.userId));
  if (missing.length > 0) {
    await prisma.meetingAttendee.createMany({
      data: missing.map((a) => ({
        meetingId: m.id,
        workspaceId: m.ws.id,
        userId: a.userId,
        role: a.role,
        rsvp: a.rsvp,
        rsvpAt: a.rsvpAt,
        source: m.series ? ("SERIES" as const) : ("INVITED" as const),
        invitedBy: m.hostId,
        invitedAt: a.invitedAt,
        removedAt: null,
        removedBy: null,
        firstJoinedAt: a.firstJoinedAt,
        attendedSeconds: a.attendedSeconds,
        meetingStartAt: m.startAt,
        meetingEndAt: m.endAt,
        meetingStatus: m.state,
        createdAt: a.invitedAt,
        updatedAt: a.updatedAt,
      })),
    });
    stats.attendees += missing.length;
    if (!isNew) {
      // Lần chạy dở dang trước đó đã tạo cuộc họp nhưng thiếu người: vá số đếm phi chuẩn hoá cho khớp (không động vào cuộc họp mà người dùng đã sửa).
      const active = await prisma.meetingAttendee.count({ where: { meetingId: m.id, removedAt: null } });
      await prisma.meeting.updateMany({ where: { id: m.id }, data: { attendeeCount: active } });
    }
  }
  const r = m.recap;
  if (r && !(await prisma.meetingRecap.findUnique({ where: { meetingId: m.id }, select: { id: true } }))) {
    await prisma.meetingRecap.create({
      data: {
        id: r.id,
        meetingId: m.id,
        workspaceId: m.ws.id,
        content: r.content,
        publishedContent: r.publishedAt ? r.content : null,
        publishedAssetIds: [],
        startedAt: m.startedAt,
        endedAt: m.endedAt,
        authorId: r.authorId,
        lastEditedBy: r.authorId,
        publishedAt: r.publishedAt,
        publishedBy: r.publishedBy,
        publishedVersion: r.publishedAt ? r.version : null,
        systemMessageId: null,
        attachmentCount: 0,
        version: r.version,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      },
    });
    stats.recaps += 1;
    if (r.publishedAt) stats.published += 1;
  }
}

async function writeSeries(s: ResolvedSeries, stats: Stats): Promise<void> {
  if (await prisma.meetingSeries.findUnique({ where: { id: s.id }, select: { id: true } })) return;
  const p = s.plan;
  const external = p.where && "platform" in p.where ? p.where : null;
  const physical = p.where && "format" in p.where ? p.where : null;
  await prisma.meetingSeries.create({
    data: {
      id: s.id,
      workspaceId: s.ws.id,
      hostId: s.hostId,
      rule: { freq: "WEEKLY", interval: 1, byWeekday: [p.weekday], count: p.count },
      timezone: TIMEZONE,
      localStartTime: `${String(p.at[0]).padStart(2, "0")}:${String(p.at[1]).padStart(2, "0")}`,
      durationMinutes: p.mins,
      template: {
        title: p.title,
        agenda: p.agenda,
        format: physical?.format ?? "ONLINE",
        location: physical?.location ?? null,
        platform: external?.platform ?? "INTERNAL",
        externalUrl: external?.url ?? null,
        visibility: "ATTENDEES",
        lobbyMode: "NON_ATTENDEES",
        reminderMinutes: [...(p.remind ?? [15])].sort((a, b) => b - a),
        notifyVia: "APP",
        recapRequired: p.recapRequired ?? false,
        recordingAllowed: true,
        createChatGroup: false,
      },
      attendeeIds: s.attendeeIds,
      coHostIds: s.coHostIds,
      materializedUntil: s.materializedUntil,
      status: "ACTIVE",
      createdBy: s.hostId,
      version: 1,
      createdAt: s.createdAt,
      updatedAt: s.createdAt,
    },
  });
  stats.series += 1;
}

interface NotifDraft {
  type: "meeting.invited" | "meeting.reminder" | "meeting.recap-published" | "meeting.recap-required" | "meeting.cancelled";
  m: ResolvedMeeting;
  actorId: string | null;
  sourceId: string;
  refs: Prisma.InputJsonObject;
  at: Date;
  unread: boolean;
}

/** Thông báo họp của `thu`, suy từ chính các cuộc họp vừa seed — cùng `refs`/`dedupeKey` như `MeetingEventHandler` & `MeetingReminderService` tạo. */
function thuDrafts(thuId: string, now: Date, meetings: readonly ResolvedMeeting[]): NotifDraft[] {
  const out: NotifDraft[] = [];
  const ago = (d: Date, hours: number): boolean => now.getTime() - d.getTime() < hours * 3_600_000;
  for (const m of meetings) {
    const me = m.attendees.find((a) => a.userId === thuId);
    if (!me) continue;
    const base = { workspaceId: m.ws.id, meetingId: m.id };
    const rng = mixedRng(`notif:${m.key}`);
    if (me.role !== "HOST" && (!m.series || m.series.index === 0)) {
      out.push({
        type: "meeting.invited", m, actorId: m.hostId, sourceId: `meeting-invited:${m.id}:v1`, refs: { ...base, startAt: m.startAt.toISOString() },
        at: new Date(m.createdAt.getTime() + 2000), unread: m.state === "SCHEDULED" && (me.rsvp === "PENDING" || ago(m.createdAt, 30)),
      });
    }
    if (m.state === "CANCELLED" && m.cancel && m.cancel.by !== thuId) {
      out.push({ type: "meeting.cancelled", m, actorId: m.cancel.by, sourceId: `meeting-cancelled:${m.id}:v2`, refs: base, at: m.cancel.at, unread: ago(m.cancel.at, 48) });
    }
    if (m.state !== "CANCELLED" && now.getTime() - m.startAt.getTime() < 8 * 86_400_000) {
      const fired = m.remind.filter((min) => m.startAt.getTime() - min * MIN_MS <= now.getTime() - MIN_MS);
      if (fired.length > 0) {
        const minutesBefore = Math.min(...fired);
        const at = new Date(m.startAt.getTime() - minutesBefore * MIN_MS + Math.floor(rng() * 20_000));
        out.push({
          type: "meeting.reminder", m, actorId: null, sourceId: `meeting-reminder:${m.id}:${minutesBefore}:${m.startAt.getTime()}`,
          refs: { ...base, startAt: m.startAt.toISOString(), minutesBefore }, at, unread: m.state === "SCHEDULED" && ago(at, 30),
        });
      }
    }
    const rc = m.recap;
    if (rc?.publishedAt && rc.publishedBy !== thuId) {
      out.push({
        type: "meeting.recap-published", m, actorId: rc.publishedBy, sourceId: `meeting-recap-published:${m.id}`, refs: { ...base, recapId: rc.id },
        at: new Date(rc.publishedAt.getTime() + 1000), unread: ago(rc.publishedAt, 60),
      });
    }
    if (m.recapRequired && m.state === "ENDED" && m.endedAt && !rc?.publishedAt && (me.role === "HOST" || me.role === "CO_HOST")) {
      out.push({ type: "meeting.recap-required", m, actorId: null, sourceId: `meeting-recap-required:${m.id}:${m.endedAt.getTime()}`, refs: base, at: m.endedAt, unread: true });
    }
  }
  return out;
}

async function writeNotifications(thuId: string, now: Date, drafts: readonly NotifDraft[]): Promise<number> {
  let created = 0;
  for (const d of drafts) {
    if (await prisma.notification.findUnique({ where: { dedupeKey: d.sourceId }, select: { id: true } })) continue;
    const rng = mixedRng(`notif-read:${d.sourceId}`);
    const readAt = d.unread ? null : new Date(Math.min(d.at.getTime() + (3 + Math.floor(rng() * 600)) * MIN_MS, now.getTime()));
    await prisma.notification.create({
      data: {
        type: d.type,
        scopeType: "MEETING",
        scopeId: d.m.id,
        workspaceId: d.m.ws.id,
        actorId: d.actorId,
        sourceType: "Meeting",
        sourceId: d.sourceId,
        refs: d.refs,
        dedupeKey: d.sourceId,
        createdAt: d.at,
        recipients: {
          create: {
            recipientId: thuId,
            kind: "DEFAULT",
            inInbox: true,
            dedupeKey: d.sourceId,
            scopeType: "MEETING",
            scopeId: d.m.id,
            workspaceId: d.m.ws.id,
            readAt,
            seenAt: null,
            pushStatus: "SKIPPED",
            skipReason: "NO_DEVICE",
            deliveredPushAt: null,
            createdAt: new Date(d.at.getTime() + 500),
            kindRank: 0,
            streamKey: null,
            streamSeq: null,
            filterBucket: "meetings",
            cancelledAt: null,
          },
        },
      },
    });
    created += 1;
  }
  return created;
}

export const seedMeetings: ModuleSeed = async (c) => {
  const memberships = await prisma.workspaceMembership.findMany({
    where: { workspaceId: { in: [...c.workspaces.values()].map((w) => w.id) }, status: "ACTIVE" },
    select: { workspaceId: true, userId: true, joinedAt: true },
  });
  const joined = new Map<string, Map<string, Date>>();
  for (const r of memberships) {
    const inner = joined.get(r.workspaceId) ?? new Map<string, Date>();
    inner.set(r.userId, r.joinedAt);
    joined.set(r.workspaceId, inner);
  }

  const { meetings, series, skipped } = resolveAll({ dir: c.dir, now: c.now, workspaces: c.workspaces, joined });
  const stats: Stats = { meetings: 0, attendees: 0, recaps: 0, published: 0, series: 0, notifications: 0 };
  for (const s of series) await writeSeries(s, stats);
  for (const m of meetings) await writeMeeting(m, stats);
  const thuId = c.dir.id("thu");
  stats.notifications = await writeNotifications(thuId, c.now, thuDrafts(thuId, c.now, meetings));

  const skip = skipped.length > 0 ? ` (bỏ qua ${skipped.length} kế hoạch vì thiếu nhóm/người: ${skipped.join(", ")})` : "";
  return `Họp: +${stats.meetings} cuộc họp (+${stats.series} chuỗi), +${stats.attendees} người tham dự, +${stats.recaps} biên bản (${stats.published} đã công bố), +${stats.notifications} thông báo cho thu${skip}`;
};
