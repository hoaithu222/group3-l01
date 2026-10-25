import type {
  AdminInsights,
  InsightsMetric,
  InsightsRange,
  InsightsSeriesPoint,
} from '@/core/api/admin';
import { formatNumber } from '@/shared/utils/format';

import {
  INSIGHTS_DEFAULT_RANGE,
  INSIGHTS_RANGE_OPTIONS,
  TREND_METRIC_ORDER,
  TREND_METRICS,
} from '../constants/insights.constants';
import type { TrendMetricKey, TrendRow } from '../types/insights.types';
import { formatSeriesDayTick } from './overview-series.utils';

const DAY_MS = 86_400_000;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}/;

/** Giá trị `?range=` lạ/rỗng ⇒ mặc định (`30d`) — URL do người dùng gõ tay không được làm gãy trang. */
export function parseInsightsRange(raw: string): InsightsRange {
  return INSIGHTS_RANGE_OPTIONS.find((o) => o.key === raw)?.key ?? INSIGHTS_DEFAULT_RANGE;
}

/** Các chỉ số VẼ ĐƯỢC của lần tải này: chuỗi vắng nghĩa là cờ phân hệ tắt, KHÔNG phải "toàn số 0" — không đưa vào bộ chọn. */
export function availableTrendMetrics(insights: AdminInsights | undefined): TrendMetricKey[] {
  if (!insights) return [];
  return TREND_METRIC_ORDER.filter((key) => insights.series[key] !== undefined);
}

/** Số tổng kỳ (kèm kỳ trước) của một chỉ số vẽ được — dùng cho huy hiệu ▲▼ cạnh biểu đồ. */
export function trendKpi(insights: AdminInsights, key: TrendMetricKey): InsightsMetric | undefined {
  return insights.kpis[TREND_METRICS[key].kpi];
}

/**
 * Ghép kỳ hiện tại với kỳ trước THEO VỊ TRÍ (ngày thứ i ↔ ngày thứ i) — đúng hợp đồng BE (`previousSeries` cùng độ dài). Không có kỳ trước
 * thì `previous = null` (khác 0: đừng vẽ đường kỳ trước nằm dưới đáy).
 */
export function buildTrendRows(
  current: readonly InsightsSeriesPoint[],
  previous: readonly InsightsSeriesPoint[] | undefined,
): TrendRow[] {
  return current.map((point, i) => {
    const prev = previous?.[i];
    return {
      date: point.date,
      current: point.count,
      previous: prev ? prev.count : null,
      previousDate: prev ? prev.date : null,
    };
  });
}

/** Có ít nhất một điểm khác 0 ở một trong hai kỳ. BE lấp 0 cho mọi ngày nên "rỗng" nghĩa là toàn 0 — khi đó hiện trạng thái rỗng, không vẽ đường phẳng. */
export function hasTrendActivity(rows: readonly TrendRow[]): boolean {
  return rows.some((r) => r.current !== 0 || (r.previous ?? 0) !== 0);
}

/** `06/09 – 05/10` — khoảng ngày của một chuỗi (rỗng ⇒ chuỗi rỗng). */
export function seriesRangeLabel(points: readonly { date: string }[]): string {
  if (points.length === 0) return '';
  return `${formatSeriesDayTick(points[0].date)} – ${formatSeriesDayTick(points[points.length - 1].date)}`;
}

/** Nhãn trục Y gọn: `9.500` · `12,5K` · `1,2M` — trục `large` chỉ rộng 50px, số 6–7 ký tự bị cắt đầu. */
export function formatAxisNumber(value: number): string {
  const trim = (x: number) => {
    const rounded = Math.round(x * 10) / 10;
    return formatNumber(rounded, Number.isInteger(rounded) ? 0 : 1);
  };
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${trim(value / 1_000_000)}M`;
  if (abs >= 10_000) return `${trim(value / 1_000)}K`;
  return formatNumber(value);
}

/**
 * Các ngày ĐÃ TRỌN VẸN: bỏ ngày của `generatedAt` (UTC) vì nó mới đi được một phần — số "hôm nay" luôn thấp chỉ vì ngày chưa hết, đem so với
 * trung bình sẽ báo động giả mỗi buổi sáng. `generatedAt` hỏng ⇒ coi mọi ngày là trọn vẹn.
 */
export function completeDays(
  points: readonly InsightsSeriesPoint[],
  generatedAt: string,
): InsightsSeriesPoint[] {
  if (!ISO_DATE.test(generatedAt)) return [...points];
  const today = generatedAt.slice(0, 10);
  return points.filter((p) => p.date < today);
}

/** `YYYY-MM-DD` của ngày liền trước (theo UTC, cùng quy ước với chuỗi của BE). Đầu vào hỏng ⇒ chuỗi rỗng (không bao giờ ném lỗi). */
export function utcDayBefore(date: string): string {
  const time = Date.parse(`${date}T00:00:00Z`);
  return Number.isNaN(time) ? '' : new Date(time - DAY_MS).toISOString().slice(0, 10);
}

/** Số ngày LIỀN CUỐI chuỗi có `count = 0`. */
export function trailingZeroDays(points: readonly InsightsSeriesPoint[]): number {
  let n = 0;
  for (let i = points.length - 1; i >= 0 && points[i].count === 0; i -= 1) n += 1;
  return n;
}

/** Trung bình `count` (số thực — nơi gọi tự làm tròn khi hiển thị). Rỗng ⇒ 0. */
export function meanCount(points: readonly InsightsSeriesPoint[]): number {
  if (points.length === 0) return 0;
  return points.reduce((sum, p) => sum + p.count, 0) / points.length;
}
