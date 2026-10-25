/** Dưới mốc này (ms) đồng hồ đổi tông cảnh báo + hiện chữ (không chỉ màu) và đọc thông báo trợ năng. */
export const TIMER_WARN_MS = 5 * 60_000;
/** Dưới mốc này (ms) là "sắp hết giờ": tông đỏ + thông báo trợ năng thứ hai. */
export const TIMER_CRITICAL_MS = 60_000;

export type TimerPhase = 'critical' | 'expired' | 'normal' | 'warn';

/**
 * Giai đoạn của đồng hồ theo thời gian còn lại. `expired` chỉ khi ≤ 0 — đúng lúc `CountdownTimer` gọi `onExpire`.
 * Ngưỡng là `<` (không phải `<=`): còn đúng 5 phút vẫn là "bình thường", đồng hồ chỉ báo động khi đã THẬT SỰ xuống dưới.
 */
export function timerPhase(leftMs: number): TimerPhase {
  if (leftMs <= 0) return 'expired';
  if (leftMs < TIMER_CRITICAL_MS) return 'critical';
  return leftMs < TIMER_WARN_MS ? 'warn' : 'normal';
}

/** Dòng chữ đi kèm tông cảnh báo — màu KHÔNG được là kênh thông tin duy nhất (`mobile-ux.md`). `null` ⇒ không cần nhắc. */
export function timerPhaseLabel(phase: TimerPhase): string | null {
  if (phase === 'warn') return 'Còn dưới 5 phút';
  if (phase === 'critical') return 'Còn dưới 1 phút';
  return phase === 'expired' ? 'Đã hết giờ' : null;
}

/** Tỉ lệ thời gian còn lại 0..1 cho vòng đồng hồ. `totalMs` không hợp lệ ⇒ 1 (vòng đầy, không bịa ra tiến độ). */
export function timerRatio(leftMs: number, totalMs: number): number {
  if (!Number.isFinite(totalMs) || totalMs <= 0) return 1;
  return Math.min(1, Math.max(0, leftMs / totalMs));
}
