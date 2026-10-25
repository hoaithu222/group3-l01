import type { Prisma } from "@prisma/client";
import { prisma } from "../../../infrastructure/database";
import type { CallEndReasonValue, WorkspaceMediaStats } from "../entities/admin-media.types";
import type { CallDayAgg, IMediaOpsStatsReader, OverviewCounts, SetupDayAgg, StatsRange } from "./media-ops-read.repository.interface";
import { dateEjson, dayKeyOf, num, oid } from "./media-ops-raw";

/** `CallParticipant` không phi chuẩn hoá `workspaceId` ⇒ lọc theo nhóm qua `$lookup` sang `Call` (sau `$match` theo thời gian nên chỉ tra các dòng trong khoảng). */
const workspaceStages = (workspaceId: string): Prisma.InputJsonObject[] => [
  { $lookup: { from: "Call", localField: "callId", foreignField: "_id", as: "call" } },
  { $match: { "call.workspaceId": oid(workspaceId) } },
];

const present = (field: string): Prisma.InputJsonObject => ({ $ne: [{ $ifNull: [field, null] }, null] });

/** Aggregation của p2-07 be.md §5.4 (gom ngày theo `tz`). Chỉ ĐỌC; hàng đợi ghi/CSV [P1] chưa có. */
export class PrismaMediaOpsStatsReader implements IMediaOpsStatsReader {
  async callsByDay(r: StatsRange, withinMs: number): Promise<{ days: CallDayAgg[]; setup: SetupDayAgg[] }> {
    const ws = r.workspaceId ? { workspaceId: oid(r.workspaceId) } : {};
    const [days, setup] = await Promise.all([
      prisma.call.aggregateRaw({
        pipeline: [
          { $match: { startedAt: { $gte: dateEjson(r.from), $lt: dateEjson(r.to) }, ...ws } },
          {
            $group: {
              _id: dayKeyOf("$startedAt", r.tz),
              calls: { $sum: 1 },
              ringCalls: { $sum: { $cond: [{ $eq: ["$mode", "RING"] }, 1, 0] } },
              answered: { $sum: { $cond: [{ $and: [{ $eq: ["$mode", "RING"] }, present("$answeredAt")] }, 1, 0] } },
              durationSum: { $sum: { $ifNull: ["$durationSec", 0] } },
              endedWithDuration: { $sum: { $cond: [{ $gt: ["$durationSec", 0] }, 1, 0] } },
            },
          },
        ],
      }),
      prisma.callParticipant.aggregateRaw({
        pipeline: [
          { $match: { callStartedAt: { $gte: dateEjson(r.from), $lt: dateEjson(r.to) }, joiningAt: { $ne: null } } },
          ...(r.workspaceId ? workspaceStages(r.workspaceId) : []),
          {
            $group: {
              _id: dayKeyOf("$callStartedAt", r.tz),
              attempts: { $sum: 1 },
              success: { $sum: { $cond: [{ $and: [present("$firstJoinedAt"), { $lte: [{ $subtract: ["$firstJoinedAt", "$joiningAt"] }, withinMs] }] }, 1, 0] } },
            },
          },
        ],
      }),
    ]);
    type Raw = Record<string, unknown> & { _id: string };
    return {
      days: (days as unknown as Raw[]).map((g) => ({
        date: String(g._id), calls: num(g.calls), ringCalls: num(g.ringCalls), answered: num(g.answered), durationSum: num(g.durationSum), endedWithDuration: num(g.endedWithDuration),
      })),
      setup: (setup as unknown as Raw[]).map((g) => ({ date: String(g._id), attempts: num(g.attempts), success: num(g.success) })),
    };
  }

  async endReasonCounts(r: StatsRange): Promise<Array<{ reason: CallEndReasonValue; count: number }>> {
    const raw = await prisma.call.aggregateRaw({
      pipeline: [
        { $match: { startedAt: { $gte: dateEjson(r.from), $lt: dateEjson(r.to) }, status: "ENDED", ...(r.workspaceId ? { workspaceId: oid(r.workspaceId) } : {}) } },
        { $group: { _id: "$endReason", count: { $sum: 1 } } },
      ],
    });
    return (raw as unknown as Array<{ _id: string | null; count: unknown }>).flatMap((g) => (g._id ? [{ reason: g._id as CallEndReasonValue, count: num(g.count) }] : []));
  }

  async workspaceExists(id: string): Promise<boolean> {
    return (await prisma.workspace.count({ where: { id } })) > 0;
  }

  async workspaceMediaStats(workspaceId: string, from: Date): Promise<Omit<WorkspaceMediaStats, "days">> {
    const meetingWhere: Prisma.MeetingWhereInput = { workspaceId, deletedAt: null, startAt: { gte: from } };
    const [meetingGroups, meetingCalls, callGroups, recordings] = await Promise.all([
      prisma.meeting.groupBy({ by: ["status"], where: meetingWhere, _count: { _all: true } }),
      prisma.call.aggregate({ where: { workspaceId, scopeType: "MEETING", startedAt: { gte: from } }, _sum: { durationSec: true } }),
      prisma.call.groupBy({ by: ["mode"], where: { workspaceId, scopeType: { not: "MEETING" }, startedAt: { gte: from } }, _count: { _all: true }, _sum: { durationSec: true } }),
      prisma.meetingRecording.aggregate({ where: { workspaceId, status: "READY", deletedAt: null, startedAt: { gte: from } }, _count: { _all: true }, _sum: { fileSizeBytes: true } }),
    ]);
    const count = (s: string): number => meetingGroups.find((g) => g.status === s)?._count._all ?? 0;
    const mode = (m: "RING" | "ROOM") => callGroups.find((g) => g.mode === m);
    const seconds = (callGroups.reduce((sum, g) => sum + (g._sum.durationSec ?? 0), 0));
    return {
      meetings: { scheduled: count("SCHEDULED"), held: count("LIVE") + count("ENDED"), cancelled: count("CANCELLED"), totalMinutes: Math.floor((meetingCalls._sum.durationSec ?? 0) / 60) },
      calls: { total: callGroups.reduce((s, g) => s + g._count._all, 0), ring: mode("RING")?._count._all ?? 0, room: mode("ROOM")?._count._all ?? 0, minutes: Math.floor(seconds / 60) },
      recordings: { ready: recordings._count._all, storageBytes: recordings._sum.fileSizeBytes ?? 0 },
    };
  }

  async overviewCounts(dayStart: Date, since7d: Date, since24h: Date): Promise<OverviewCounts> {
    const [liveMeetings, callsToday, calls7d, storage, failed] = await Promise.all([
      prisma.meeting.count({ where: { status: "LIVE", deletedAt: null } }),
      prisma.call.count({ where: { startedAt: { gte: dayStart } } }),
      prisma.call.aggregate({ where: { status: "ENDED", startedAt: { gte: since7d } }, _sum: { durationSec: true } }),
      prisma.meetingRecording.aggregate({ where: { status: "READY", deletedAt: null }, _sum: { fileSizeBytes: true } }),
      prisma.meetingRecording.count({ where: { status: "FAILED", updatedAt: { gte: since24h } } }),
    ]);
    return { liveMeetings, callsToday, callSeconds7d: calls7d._sum.durationSec ?? 0, recordingStorageBytes: storage._sum.fileSizeBytes ?? 0, egressFailed24h: failed };
  }
}
