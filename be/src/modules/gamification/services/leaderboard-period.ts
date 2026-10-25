import { DEFAULT_TIME_ZONE, localDate, localParts, startOfLocalDayPlus } from "../../../core/utils/local-date";

/**
 * Kỳ bảng xếp hạng (p4-03 README §2) — HÀM THUẦN. Tuần bắt đầu THỨ HAI, tháng bắt đầu ngày 1, theo múi giờ nhóm (mặc định Asia/Ho_Chi_Minh — `Workspace.timezone`
 * chưa có ở p1-01). `from`/`to` là instant UTC (`XpEvent.occurredAt ∈ [from, to)`); `ALL` không chặn. `key` khoá bộ nhớ đệm — đổi kỳ thì tự đổi khoá.
 */
export const LEADERBOARD_PERIODS = ["WEEK", "MONTH", "ALL"] as const;
export type LeaderboardPeriod = (typeof LEADERBOARD_PERIODS)[number];

export interface PeriodRange {
  period: LeaderboardPeriod;
  from: Date | null;
  to: Date | null;
  key: string;
}

export function periodRange(period: LeaderboardPeriod, now: Date, tz: string = DEFAULT_TIME_ZONE): PeriodRange {
  if (period === "ALL") return { period, from: null, to: null, key: "all" };
  const p = localParts(now, tz);
  if (period === "WEEK") {
    const weekday = new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay(); // 0 = Chủ nhật
    const sinceMonday = (weekday + 6) % 7;
    const from = startOfLocalDayPlus(now, tz, -sinceMonday);
    return { period, from, to: startOfLocalDayPlus(now, tz, 7 - sinceMonday), key: localDate(from, tz) };
  }
  const daysInMonth = new Date(Date.UTC(p.year, p.month, 0)).getUTCDate();
  const from = startOfLocalDayPlus(now, tz, -(p.day - 1));
  return { period, from, to: startOfLocalDayPlus(now, tz, daysInMonth - p.day + 1), key: `${p.year}-${String(p.month).padStart(2, "0")}` };
}
