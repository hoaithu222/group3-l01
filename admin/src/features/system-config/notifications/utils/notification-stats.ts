import { NOTIFICATION_SUPPRESS_REASONS } from '../constants/notifications.constants';
import type { NotificationSuppressed } from '../types/notification-stats.types';

/**
 * Trần của histogram fan-out phía BE: bucket "inf" (> 5 giây) được `p95FromBuckets` gán 10 000 ms.
 * Giá trị ≥ ngưỡng này nghĩa là "hơn 5 giây", KHÔNG phải đúng 10 giây.
 */
const FANOUT_OVERFLOW_MS = 10_000;

/**
 * p95 thời gian fan-out để hiển thị. BE trả CẬN TRÊN của bucket chứa phân vị 95 nên luôn ghi
 * kèm "≤"; bucket tràn ghi "> 5 giây"; `null` (chưa có job nào) ghi thẳng là chưa có dữ liệu.
 */
export function formatFanoutP95(ms: number | null): string {
  if (ms === null) return 'Chưa có dữ liệu';
  if (ms >= FANOUT_OVERFLOW_MS) return '> 5 giây';
  return ms >= 1000 ? `≤ ${ms / 1000} giây` : `≤ ${ms} ms`;
}

export interface SuppressedPoint {
  key: keyof NotificationSuppressed;
  label: string;
  count: number;
}

/** Số push bị chặn theo lý do, đúng thứ tự cố định của `NOTIFICATION_SUPPRESS_REASONS`. */
export function toSuppressedPoints(suppressed: NotificationSuppressed): SuppressedPoint[] {
  return NOTIFICATION_SUPPRESS_REASONS.map(({ key, label }) => ({
    key,
    label,
    count: suppressed[key] ?? 0,
  }));
}
