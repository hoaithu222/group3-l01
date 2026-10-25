import type { Prisma } from "@prisma/client";
import { escapeRegex } from "../../../core/utils/escape-regex";
import { normalizeSearch } from "../../../core/utils/normalize";
import { prisma } from "../../../infrastructure/database";
import type { CallRecord, MeetingRecord, SessionAgg } from "../entities/admin-media.types";
import type { IMediaOpsMeetingReader, MeetingListFilter } from "./media-ops-read.repository.interface";
import { CALL_SELECT, byIdMap } from "./media-ops-select";

/** `select` tối thiểu — KHÔNG agenda/location/externalUrl/conversationId/visibility/lobby…; nên dù sau này ai thêm DTO cũng không có dữ liệu nhạy cảm để lộ. */
const MEETING_SELECT = {
  id: true, code: true, title: true, workspaceId: true, hostId: true, startAt: true, endAt: true, timezone: true, status: true, platform: true,
  attendeeCount: true, endReason: true, cancelledAt: true, currentCallId: true, lockedAt: true, version: true,
} satisfies Prisma.MeetingSelect;

const ORDER: Record<MeetingListFilter["sort"], Prisma.MeetingOrderByWithRelationInput[]> = {
  "-startAt": [{ startAt: "desc" }, { id: "desc" }],
  startAt: [{ startAt: "asc" }, { id: "asc" }],
  "-attendeeCount": [{ attendeeCount: "desc" }, { startAt: "desc" }, { id: "desc" }],
};

export class PrismaMediaOpsMeetingReader implements IMediaOpsMeetingReader {
  async listMeetings(f: MeetingListFilter): Promise<{ rows: MeetingRecord[]; total: number }> {
    const q = f.q ? normalizeSearch(f.q) : "";
    // `deletedAt: null` khớp vì `createMeeting` ghi null TƯỜNG MINH (Prisma+Mongo: vắng mặt ≠ null). `contains` KHÔNG escape regex ⇒ luôn bọc `escapeRegex`.
    const where: Prisma.MeetingWhereInput = {
      deletedAt: null,
      ...(f.workspaceId ? { workspaceId: f.workspaceId } : {}),
      ...(f.statuses && f.statuses.length > 0 ? { status: { in: f.statuses } } : {}),
      ...(f.platform ? { platform: f.platform } : {}),
      ...(f.from || f.to ? { startAt: { ...(f.from ? { gte: f.from } : {}), ...(f.to ? { lte: f.to } : {}) } } : {}),
      ...(q ? { OR: [{ normalizedTitle: { contains: escapeRegex(q) } }, { code: (f.q ?? "").toLowerCase() }] } : {}),
    };
    const [rows, total] = await Promise.all([
      prisma.meeting.findMany({ where, select: MEETING_SELECT, orderBy: ORDER[f.sort], skip: (f.page - 1) * f.limit, take: f.limit }),
      prisma.meeting.count({ where }),
    ]);
    return { rows, total };
  }

  findMeeting(id: string): Promise<MeetingRecord | null> {
    return prisma.meeting.findFirst({ where: { id, deletedAt: null }, select: MEETING_SELECT });
  }

  async sessionAggs(meetingIds: string[]): Promise<Map<string, SessionAgg>> {
    if (meetingIds.length === 0) return new Map();
    const groups = await prisma.call.groupBy({
      by: ["scopeId"],
      where: { scopeType: "MEETING", scopeId: { in: meetingIds } },
      _count: { _all: true },
      _sum: { durationSec: true },
    });
    return new Map(groups.map((g) => [g.scopeId, { sessionCount: g._count._all, totalDurationSec: g._sum.durationSec ?? 0 }]));
  }

  async readyRecordingCounts(meetingIds: string[]): Promise<Map<string, number>> {
    if (meetingIds.length === 0) return new Map();
    const groups = await prisma.meetingRecording.groupBy({
      by: ["meetingId"],
      where: { meetingId: { in: meetingIds }, deletedAt: null, status: "READY" },
      _count: { _all: true },
    });
    return new Map(groups.map((g) => [g.meetingId, g._count._all]));
  }

  recentSessions(meetingId: string, limit: number): Promise<CallRecord[]> {
    return prisma.call.findMany({ where: { scopeType: "MEETING", scopeId: meetingId }, select: CALL_SELECT, orderBy: [{ startedAt: "desc" }, { id: "desc" }], take: limit });
  }

  connectedCount(callId: string): Promise<number> {
    return prisma.callParticipant.count({ where: { callId, state: { in: ["CONNECTED", "RECONNECTING"] } } });
  }

  async recordingSummary(meetingId: string): Promise<{ ready: number; failed: number; totalBytes: number }> {
    const groups = await prisma.meetingRecording.groupBy({
      by: ["status"],
      where: { meetingId, deletedAt: null, status: { in: ["READY", "FAILED"] } },
      _count: { _all: true },
      _sum: { fileSizeBytes: true },
    });
    const of = (s: string) => groups.find((g) => g.status === s);
    return { ready: of("READY")?._count._all ?? 0, failed: of("FAILED")?._count._all ?? 0, totalBytes: of("READY")?._sum.fileSizeBytes ?? 0 };
  }

  async workspaceNames(ids: string[]): Promise<Map<string, string>> {
    const uniq = [...new Set(ids)];
    if (uniq.length === 0) return new Map();
    return byIdMap(await prisma.workspace.findMany({ where: { id: { in: uniq } }, select: { id: true, name: true } }), (r) => r.name);
  }

  async userNames(ids: string[]): Promise<Map<string, string>> {
    const uniq = [...new Set(ids)];
    if (uniq.length === 0) return new Map();
    return byIdMap(await prisma.user.findMany({ where: { id: { in: uniq } }, select: { id: true, name: true } }), (r) => r.name);
  }
}
