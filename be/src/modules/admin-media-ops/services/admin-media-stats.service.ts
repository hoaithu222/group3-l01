import { createHash } from "crypto";
import { LIMITS } from "../../../core/constants/limits";
import { NotFoundError } from "../../../core/exceptions";
import { addDaysToLocalDate, localDate } from "../../../core/utils/local-date";
import { isValidIanaTimeZone } from "../../../core/utils/timezone";
import type { CallStatsQueryDto } from "../dtos";
import type { CallStats, CallStatsTotals, WorkspaceMediaStats } from "../entities/admin-media.types";
import type { CallDayAgg, IMediaOpsStatsReader, SetupDayAgg } from "../repositories/media-ops-read.repository.interface";
import type { CachePort } from "./admin-media-cache";
import { statsRangeInvalid } from "./admin-media-errors";

const DAY_MS = 86_400_000;
const ratio = (num: number, den: number): number | null => (den > 0 ? Math.round((num / den) * 10_000) / 10_000 : null);

/** Dãy `YYYY-MM-DD` từ ngày của `from` tới ngày của `to − 1 ms` theo `tz` (ngày không có dữ liệu được lấp 0). */
export function dayKeysBetween(from: Date, to: Date, tz: string): string[] {
  const first = localDate(from, tz);
  const last = localDate(new Date(to.getTime() - 1), tz);
  const keys: string[] = [];
  for (let k = first; k <= last && keys.length <= LIMITS.adminMedia.statsRangeMaxDays + 2; k = addDaysToLocalDate(k, 1)) keys.push(k);
  return keys;
}

/**
 * Thống kê cuộc gọi (p2-07 be.md §5.4) — aggregation Mongo theo ngày + cache Redis `statsCacheSeconds`. `answerRate = RING có người trả lời / RING`;
 * `setupSuccessRate = participant CONNECTED ≤ 20 s kể từ JOINING / participant có JOINING`; mẫu số 0 → `null` (UI hiện "—").
 * Số liệu tổng hợp — không id/tên người dùng, không nội dung.
 */
export class AdminMediaStatsService {
  constructor(
    private readonly reader: IMediaOpsStatsReader,
    private readonly cache: CachePort,
    private readonly now: () => Date = () => new Date()
  ) {}

  async callStats(q: CallStatsQueryDto): Promise<CallStats> {
    const L = LIMITS.adminMedia;
    if (!isValidIanaTimeZone(q.tz) || !(q.to.getTime() > q.from.getTime()) || q.to.getTime() - q.from.getTime() > L.statsRangeMaxDays * DAY_MS) throw statsRangeInvalid();

    const key = `admin-media:stats:${createHash("sha1").update([q.from.toISOString(), q.to.toISOString(), q.tz, q.workspaceId ?? ""].join("|")).digest("hex")}`;
    const cached = await this.cache.get<CallStats>(key);
    if (cached) return { ...cached, serverNow: this.now().toISOString() };

    const range = { from: q.from, to: q.to, tz: q.tz, workspaceId: q.workspaceId };
    const [{ days, setup }, reasons] = await Promise.all([this.reader.callsByDay(range, L.setupSuccessSeconds * 1000), this.reader.endReasonCounts(range)]);
    const daysByKey = new Map<string, CallDayAgg>(days.map((d) => [d.date, d]));
    const setupByKey = new Map<string, SetupDayAgg>(setup.map((d) => [d.date, d]));

    const byDay = dayKeysBetween(q.from, q.to, q.tz).map((date) => {
      const d = daysByKey.get(date);
      const s = setupByKey.get(date);
      return {
        date,
        calls: d?.calls ?? 0,
        minutes: Math.floor((d?.durationSum ?? 0) / 60),
        answerRate: ratio(d?.answered ?? 0, d?.ringCalls ?? 0),
        setupSuccessRate: ratio(s?.success ?? 0, s?.attempts ?? 0),
        avgDurationSec: d && d.endedWithDuration > 0 ? Math.round(d.durationSum / d.endedWithDuration) : null,
      };
    });

    const sum = <T>(rows: T[], pick: (r: T) => number): number => rows.reduce((s, r) => s + pick(r), 0);
    const calls = sum(days, (d) => d.calls);
    const ringCalls = sum(days, (d) => d.ringCalls);
    const durationSum = sum(days, (d) => d.durationSum);
    const endedWithDuration = sum(days, (d) => d.endedWithDuration);
    const totals: CallStatsTotals = {
      calls,
      ringCalls,
      roomCalls: calls - ringCalls,
      minutes: Math.floor(durationSum / 60),
      answerRate: ratio(sum(days, (d) => d.answered), ringCalls),
      setupSuccessRate: ratio(sum(setup, (s) => s.success), sum(setup, (s) => s.attempts)),
      avgDurationSec: endedWithDuration > 0 ? Math.round(durationSum / endedWithDuration) : null,
    };

    const result: CallStats = {
      range: { from: q.from.toISOString(), to: q.to.toISOString(), tz: q.tz },
      serverNow: this.now().toISOString(),
      totals,
      byDay,
      byEndReason: [...reasons].sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason)),
    };
    await this.cache.set(key, result, L.statsCacheSeconds);
    return result;
  }

  /** `GET /admin/workspaces/:id/media-stats` (OPC-12): CHỈ số lượng/thời lượng trong `days` ngày gần nhất — không danh sách người/cuộc. */
  async workspaceStats(workspaceId: string, days: number): Promise<WorkspaceMediaStats> {
    if (!(await this.reader.workspaceExists(workspaceId))) throw new NotFoundError("Không tìm thấy workspace");
    const from = new Date(this.now().getTime() - days * DAY_MS);
    return { days, ...(await this.reader.workspaceMediaStats(workspaceId, from)) };
  }
}
