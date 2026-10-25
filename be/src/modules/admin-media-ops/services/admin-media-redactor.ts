import type {
  AdminCallDetail,
  AdminCallRow,
  AdminMeetingDetail,
  AdminMeetingRow,
  AdminMeetingSession,
  CallContext,
  CallRecord,
  MeetingRecord,
  ParticipantCounts,
  SessionAgg,
  SetupCounts,
} from "../entities/admin-media.types";

/**
 * `AdminMediaRedactor` (p2-07 be.md §5.1) — HÀM THUẦN duy nhất dựng DTO admin từ bản ghi gốc: MỌI endpoint admin đụng dữ liệu gọi/họp phải đi qua đây. Mỗi DTO được liệt kê
 * TỪNG TRƯỜNG cho phép (không spread bản ghi) nên trường mới thêm vào bản ghi gốc không bao giờ rò ra ngoài; kèm snapshot khoá trong `admin-media-redactor.test.ts` (OPC-05).
 * ⛔ Không bao giờ có: agenda, địa điểm, `externalUrl`, danh sách người tham dự, biên bản; `userId`/`initiatorId`/`hostId`/`conversationId`/`scopeId`/`livekitRoom` của cuộc gọi.
 */
const iso = (d: Date): string => d.toISOString();

export interface MeetingNames {
  workspace?: string;
  host?: string;
}

export function toMeetingRow(m: MeetingRecord, agg: SessionAgg | undefined, recordingCount: number, names: MeetingNames): AdminMeetingRow {
  return {
    id: m.id,
    code: m.code,
    title: m.title,
    workspace: { id: m.workspaceId, name: names.workspace ?? null },
    host: { id: m.hostId, name: names.host ?? null },
    startAt: iso(m.startAt),
    endAt: iso(m.endAt),
    timezone: m.timezone,
    status: m.status,
    platform: m.platform,
    attendeeCount: m.attendeeCount,
    sessionCount: agg?.sessionCount ?? 0,
    totalDurationSec: agg?.totalDurationSec ?? 0,
    recordingCount,
    ...(m.endReason ? { endReason: m.endReason } : {}),
    ...(m.cancelledAt ? { cancelledAt: iso(m.cancelledAt) } : {}),
  };
}

export function toMeetingSession(c: CallRecord): AdminMeetingSession {
  return {
    callId: c.id,
    startedAt: iso(c.startedAt),
    ...(c.endedAt ? { endedAt: iso(c.endedAt) } : {}),
    ...(c.durationSec !== null ? { durationSec: c.durationSec } : {}),
    peakParticipants: c.peakParticipants,
    ...(c.endReason ? { endReason: c.endReason } : {}),
  };
}

export interface MeetingDetailParts {
  sessions: CallRecord[];
  /** Phiên đang chạy (chỉ khi cuộc họp LIVE) + số người đang kết nối. */
  current?: { call: CallRecord; connectedCount: number; lockedAt: Date | null };
  recordings: { ready: number; failed: number; totalBytes: number };
}

export function toMeetingDetail(row: AdminMeetingRow, parts: MeetingDetailParts): AdminMeetingDetail {
  return {
    ...row,
    ...(parts.current
      ? { currentSession: { callId: parts.current.call.id, startedAt: iso(parts.current.call.startedAt), connectedCount: parts.current.connectedCount, ...(parts.current.lockedAt ? { lockedAt: iso(parts.current.lockedAt) } : {}) } }
      : {}),
    sessions: parts.sessions.map(toMeetingSession),
    recordings: { ready: parts.recordings.ready, failed: parts.recordings.failed, totalBytes: parts.recordings.totalBytes },
  };
}

/** Nhãn hiển thị + đối tượng liên quan — quyết định bằng LOẠI phạm vi, KHÔNG bao giờ trả tên/tiêu đề của hội thoại riêng tư. */
function callLabel(c: CallRecord, ctx: CallContext): Pick<AdminCallRow, "label" | "meeting" | "channel"> {
  if (c.scopeType === "MEETING") {
    const m = ctx.meetings.get(c.scopeId);
    return m ? { label: m.title, meeting: { id: c.scopeId, code: m.code, title: m.title } } : { label: "Cuộc họp" };
  }
  if (c.scopeType === "CHANNEL") {
    const ch = ctx.channels.get(c.scopeId);
    return ch && ch.visibility === "PUBLIC" ? { label: `#${ch.name}`, channel: { id: c.scopeId, name: ch.name } } : { label: "Kênh riêng tư" };
  }
  return { label: ctx.conversationKinds.get(c.scopeId) === "GROUP" ? "Nhóm chat" : "Cuộc gọi 1-1" };
}

export function toCallRow(c: CallRecord, ctx: CallContext): AdminCallRow {
  const { label, meeting, channel } = callLabel(c, ctx);
  return {
    id: c.id,
    label,
    scopeType: c.scopeType,
    mode: c.mode,
    mediaKind: c.mediaKind,
    status: c.status,
    ...(c.endReason ? { endReason: c.endReason } : {}),
    ...(c.workspaceId ? { workspace: { id: c.workspaceId, name: ctx.workspaceNames.get(c.workspaceId) ?? null } } : {}),
    startedAt: iso(c.startedAt),
    ...(c.endedAt ? { endedAt: iso(c.endedAt) } : {}),
    ...(c.durationSec !== null ? { durationSec: c.durationSec } : {}),
    peakParticipants: c.peakParticipants,
    invitedCount: c.invitedCount,
    ...(meeting ? { meeting } : {}),
    ...(channel ? { channel } : {}),
  };
}

const sum = (m: Record<string, number>, keys: string[]): number => keys.reduce((s, k) => s + (m[k] ?? 0), 0);

/** Chi tiết cuộc gọi: CHỈ số đếm theo trạng thái — không có `userId` của bất kỳ ai. */
export function toCallDetail(row: AdminCallRow, counts: ParticipantCounts, setup: SetupCounts, roomActive: boolean | undefined): AdminCallDetail {
  const s = counts;
  return {
    ...row,
    participantStats: {
      invited: sum(s, Object.keys(s)),
      answered: sum(s, ["JOINING", "CONNECTED", "RECONNECTING", "LEFT"]),
      connected: sum(s, ["CONNECTED", "RECONNECTING"]),
      missed: s["MISSED"] ?? 0,
      declined: s["DECLINED"] ?? 0,
      busy: s["BUSY"] ?? 0,
      removed: s["REMOVED"] ?? 0,
    },
    setup: { attempts: setup.attempts, successWithin20s: setup.successWithin },
    ...(roomActive !== undefined ? { roomActive } : {}),
  };
}
