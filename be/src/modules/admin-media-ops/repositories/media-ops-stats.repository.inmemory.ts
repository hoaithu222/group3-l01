import { localDate } from "../../../core/utils/local-date";
import type { CallEndReasonValue, WorkspaceMediaStats } from "../entities/admin-media.types";
import type { CallDayAgg, IMediaOpsStatsReader, OverviewCounts, SetupDayAgg, StatsRange } from "./media-ops-read.repository.interface";

export interface SeedStatCall {
  workspaceId?: string | null;
  mode: "RING" | "ROOM";
  startedAt: Date;
  answeredAt?: Date | null;
  durationSec?: number | null;
  status: "RINGING" | "ACTIVE" | "ENDED";
  endReason?: CallEndReasonValue | null;
}

export interface SeedStatParticipant {
  workspaceId?: string | null;
  callStartedAt: Date;
  joiningAt: Date | null;
  firstJoinedAt: Date | null;
}

/**
 * Bản in-memory của `IMediaOpsStatsReader` cho test đơn vị: tính lại đúng ngữ nghĩa của pipeline Mongo (nhóm ngày theo `tz`, `RING` có `answeredAt`, `durationSec > 0`,
 * `firstJoinedAt − joiningAt ≤ ngưỡng`). Số liệu workspace/overview do test gán thẳng (`wsStats`, `overview`).
 */
export class InMemoryMediaOpsStatsReader implements IMediaOpsStatsReader {
  calls: SeedStatCall[] = [];
  participants: SeedStatParticipant[] = [];
  workspaces = new Set<string>();
  wsStats: Omit<WorkspaceMediaStats, "days"> = { meetings: { scheduled: 0, held: 0, cancelled: 0, totalMinutes: 0 }, calls: { total: 0, ring: 0, room: 0, minutes: 0 }, recordings: { ready: 0, storageBytes: 0 } };
  overview: OverviewCounts = { liveMeetings: 0, callsToday: 0, callSeconds7d: 0, recordingStorageBytes: 0, egressFailed24h: 0 };
  /** Đếm số lần truy vấn — test cache khẳng định lượt 2 không chạm repository. */
  queries = 0;

  private inRange<T>(rows: T[], at: (r: T) => Date, ws: (r: T) => string | null | undefined, r: StatsRange): T[] {
    return rows.filter((row) => at(row) >= r.from && at(row) < r.to && (!r.workspaceId || ws(row) === r.workspaceId));
  }

  callsByDay(r: StatsRange, withinMs: number): Promise<{ days: CallDayAgg[]; setup: SetupDayAgg[] }> {
    this.queries += 1;
    const days = new Map<string, CallDayAgg>();
    for (const c of this.inRange(this.calls, (x) => x.startedAt, (x) => x.workspaceId, r)) {
      const key = localDate(c.startedAt, r.tz);
      const d = days.get(key) ?? { date: key, calls: 0, ringCalls: 0, answered: 0, durationSum: 0, endedWithDuration: 0 };
      d.calls += 1;
      if (c.mode === "RING") {
        d.ringCalls += 1;
        if (c.answeredAt) d.answered += 1;
      }
      d.durationSum += c.durationSec ?? 0;
      if ((c.durationSec ?? 0) > 0) d.endedWithDuration += 1;
      days.set(key, d);
    }
    const setup = new Map<string, SetupDayAgg>();
    for (const p of this.inRange(this.participants, (x) => x.callStartedAt, (x) => x.workspaceId, r).filter((x) => x.joiningAt)) {
      const key = localDate(p.callStartedAt, r.tz);
      const s = setup.get(key) ?? { date: key, attempts: 0, success: 0 };
      s.attempts += 1;
      if (p.firstJoinedAt && p.firstJoinedAt.getTime() - (p.joiningAt as Date).getTime() <= withinMs) s.success += 1;
      setup.set(key, s);
    }
    return Promise.resolve({ days: [...days.values()], setup: [...setup.values()] });
  }

  endReasonCounts(r: StatsRange): Promise<Array<{ reason: CallEndReasonValue; count: number }>> {
    const counts = new Map<CallEndReasonValue, number>();
    for (const c of this.inRange(this.calls, (x) => x.startedAt, (x) => x.workspaceId, r)) {
      if (c.status === "ENDED" && c.endReason) counts.set(c.endReason, (counts.get(c.endReason) ?? 0) + 1);
    }
    return Promise.resolve([...counts].map(([reason, count]) => ({ reason, count })));
  }

  workspaceExists(id: string): Promise<boolean> {
    return Promise.resolve(this.workspaces.has(id));
  }

  workspaceMediaStats(_workspaceId: string, _from: Date): Promise<Omit<WorkspaceMediaStats, "days">> {
    return Promise.resolve(this.wsStats);
  }

  overviewCounts(): Promise<OverviewCounts> {
    this.queries += 1;
    return Promise.resolve(this.overview);
  }
}
