import type { AdminOverviewSeriesPoint } from '@/core/api/admin';
import { formatDate } from '@/shared/utils/format';

/** Tóm tắt một chuỗi người dùng hoạt động — số hiện trên header của panel biểu đồ. */
export interface OverviewSeriesSummary {
  /** Trung bình/ngày, làm tròn về số nguyên (đơn vị là NGƯỜI). */
  average: number;
  /** Ngày cao nhất. Trùng giá trị ⇒ lấy ngày GẦN NHẤT (người đọc quan tâm hiện tại hơn). */
  peak: AdminOverviewSeriesPoint;
  /** Ngày thấp nhất. Trùng giá trị ⇒ lấy ngày gần nhất. */
  low: AdminOverviewSeriesPoint;
}

/**
 * Trung bình / cao nhất / thấp nhất của chuỗi. Chuỗi rỗng ⇒ `null` — KHÔNG trả 0: "trung bình 0
 * người/ngày" là một con số thật, còn "chưa có dữ liệu" thì không phải.
 */
export function summarizeOverviewSeries(
  points: readonly AdminOverviewSeriesPoint[],
): OverviewSeriesSummary | null {
  if (points.length === 0) return null;
  let total = 0;
  let peak = points[0];
  let low = points[0];
  for (const p of points) {
    total += p.count;
    if (p.count >= peak.count) peak = p;
    if (p.count <= low.count) low = p;
  }
  return { average: Math.round(total / points.length), peak, low };
}

/** Nhãn trục ngang: `YYYY-MM-DD` → `DD/MM` — năm lặp ở mọi nhãn chỉ tốn chỗ và làm nhãn chồng nhau. */
export function formatSeriesDayTick(date: string): string {
  return formatDate(date, 'DD/MM');
}
