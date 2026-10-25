import type { InsightsBreakdownItem, InsightsMetric, InsightsRange, InsightsSeriesPoint } from "./admin-overview-insights.types";

export const DAY_MS = 24 * 60 * 60 * 1000;

/** `YYYY-MM-DD` theo UTC — cùng quy ước `activeUsersSeries` của `GET /admin/overview`. */
export function toDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

const RANGE_DAYS: Record<InsightsRange, number> = { "7d": 7, "30d": 30, "90d": 90 };

/**
 * Hai kỳ LIỀN KỀ cùng số ngày, cắt theo ngày UTC: kỳ hiện tại gồm `days` ngày kết thúc ở HÔM NAY (ngày cuối còn dở — chấp nhận, giống
 * `activeUsersSeries`); kỳ trước là `days` ngày ngay trước đó. Truy vấn thô quét MỘT lần `[previousStart, end)` rồi tách hai kỳ ở Node — rẻ hơn
 * hai lượt quét riêng, nhất là với `Message`.
 */
export interface InsightsWindow {
  days: number;
  previousStart: Date;
  currentStart: Date;
  /** Loại trừ — 00:00 UTC ngày mai. */
  end: Date;
  previousDates: string[];
  currentDates: string[];
}

export function buildWindow(range: InsightsRange, now: Date = new Date()): InsightsWindow {
  const days = RANGE_DAYS[range];
  const today = startOfUtcDay(now);
  const currentStart = new Date(today.getTime() - (days - 1) * DAY_MS);
  const previousStart = new Date(currentStart.getTime() - days * DAY_MS);
  const datesFrom = (start: Date): string[] => Array.from({ length: days }, (_, i) => toDateKey(new Date(start.getTime() + i * DAY_MS)));
  return {
    days,
    previousStart,
    currentStart,
    end: new Date(today.getTime() + DAY_MS),
    previousDates: datesFrom(previousStart),
    currentDates: datesFrom(currentStart),
  };
}

export interface SplitSeries {
  current: InsightsSeriesPoint[];
  previous: InsightsSeriesPoint[];
  /** Tổng THÔ (trước `transform`) của từng kỳ — dùng cho KPI để khỏi cộng các số đã làm tròn. */
  totalCurrent: number;
  totalPrevious: number;
}

/** Tách bảng đếm theo ngày của cả hai kỳ thành hai chuỗi lấp 0 (ngày thứ i ↔ ngày thứ i). `transform` (vd. giây → phút) chỉ áp lên điểm chuỗi. */
export function splitSeries(byDay: Map<string, number>, w: InsightsWindow, transform: (n: number) => number = (n) => n): SplitSeries {
  const points = (dates: string[]): InsightsSeriesPoint[] => dates.map((date) => ({ date, count: transform(byDay.get(date) ?? 0) }));
  const total = (dates: string[]): number => dates.reduce((sum, date) => sum + (byDay.get(date) ?? 0), 0);
  return { current: points(w.currentDates), previous: points(w.previousDates), totalCurrent: total(w.currentDates), totalPrevious: total(w.previousDates) };
}

/** `comparable=false` ⇒ `previous = null` (kỳ trước chưa nằm trọn trong thời gian hệ thống hoạt động). `previous = 0` là số thật. */
export function metricOf(current: number, previous: number, comparable: boolean): InsightsMetric {
  return { current, previous: comparable ? previous : null };
}

/** Sắp GIẢM dần theo `count`, đồng hạng theo `key` để thứ tự ổn định giữa các lần gọi. */
export function toBreakdown(entries: Array<[string, number]>, limit?: number): InsightsBreakdownItem[] {
  const items = entries.filter(([, count]) => count > 0).map(([key, count]) => ({ key, count }));
  items.sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
  return limit ? items.slice(0, limit) : items;
}
