import type { MockAttemptSummaryDto } from '../api/mock-attempts.types';

/**
 * Chênh lệch điểm so với lượt TRƯỚC (cũ hơn) CÙNG bộ. `rows` sắp mới → cũ (đúng thứ tự BE trả, cursor theo `startedAt`);
 * chỉ tính giữa các lượt đã có điểm. Lượt đầu tiên của bộ hoặc lượt dở ⇒ không có khoá (không có gì để so).
 */
export function scoreDeltas(rows: readonly MockAttemptSummaryDto[]): Record<string, number> {
  const deltas: Record<string, number> = {};
  rows.forEach((row, index) => {
    if (row.scorePct === null) return;
    const older = rows.slice(index + 1).find((r) => r.setId === row.setId && r.scorePct !== null);
    if (older && older.scorePct !== null) deltas[row.id] = row.scorePct - older.scorePct;
  });
  return deltas;
}

/** "Tăng 10 điểm so với lượt trước" / "Giảm 5 điểm…" / "Bằng lượt trước" — cho nhãn trợ năng và dòng phụ. */
export function describeDelta(delta: number): string {
  if (delta === 0) return 'Bằng lượt trước';
  return `${delta > 0 ? 'Tăng' : 'Giảm'} ${Math.abs(delta)} điểm so với lượt trước`;
}
