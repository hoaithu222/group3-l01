import type { MockAttemptSummaryDto } from '../api/mock-attempts.types';

/** Số lượt gần nhất vẽ trên biểu đồ xu hướng. */
export const TREND_POINTS = 8;
/** Chênh lệch (điểm %) giữa nửa sau và nửa đầu chuỗi để coi là "tăng"/"giảm" thay vì "ổn định". */
export const TREND_DELTA = 5;

export type TrendKind = 'down' | 'flat' | 'up';

export interface HistoryStats {
  /** Số lượt ĐÃ CÓ ĐIỂM trong phần đã tải (lượt dở không tính). */
  attempts: number;
  average: number;
  best: number;
  /** Điểm % theo thứ tự CŨ → MỚI; rỗng khi các lượt thuộc nhiều bộ (so điểm giữa hai đề khác nhau là vô nghĩa). */
  series: number[];
  trend: TrendKind | null;
}

function mean(values: readonly number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/** Xu hướng của chuỗi điểm cũ → mới: so trung bình nửa sau với nửa đầu; dưới 3 điểm thì chưa đủ để kết luận. */
export function trendOf(series: readonly number[]): TrendKind | null {
  if (series.length < 3) return null;
  const half = Math.floor(series.length / 2);
  const diff = mean(series.slice(series.length - half)) - mean(series.slice(0, half));
  if (diff >= TREND_DELTA) return 'up';
  return diff <= -TREND_DELTA ? 'down' : 'flat';
}

/**
 * Thống kê từ các dòng lịch sử ĐÃ TẢI (`rows` mới → cũ). Không đụng dữ liệu nào ngoài `rows`: trung bình/cao nhất là của
 * phần đã tải, và xu hướng chỉ tính khi mọi lượt cùng một bộ. Chưa có lượt nào có điểm ⇒ `null`.
 */
export function historyStats(rows: readonly MockAttemptSummaryDto[]): HistoryStats | null {
  const scored = rows.flatMap((row) =>
    row.scorePct === null ? [] : [{ pct: row.scorePct, setId: row.setId }],
  );
  if (scored.length === 0) return null;
  const pcts = scored.map((s) => s.pct);
  const sameSet = new Set(scored.map((s) => s.setId)).size === 1;
  const series = sameSet ? pcts.slice(0, TREND_POINTS).reverse() : [];
  return {
    attempts: scored.length,
    average: Math.round(mean(pcts)),
    best: Math.max(...pcts),
    series,
    trend: trendOf(series),
  };
}

/** Câu đọc cho trình đọc màn hình (biểu đồ cột không phải nguồn thông tin duy nhất). */
export function describeTrend(stats: HistoryStats): string {
  const parts = [
    `${stats.attempts} lượt đã thi`,
    `điểm trung bình ${stats.average} phần trăm`,
    `cao nhất ${stats.best} phần trăm`,
  ];
  if (stats.series.length >= 2) {
    parts.push(`điểm các lượt gần đây từ cũ đến mới: ${stats.series.join(', ')}`);
  }
  return parts.join('; ');
}
