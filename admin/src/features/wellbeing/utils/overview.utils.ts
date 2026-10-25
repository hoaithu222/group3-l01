import { formatDate, formatNumber } from '@/shared/utils/format';

import {
  NO_DATA,
  OVERVIEW_DEFAULT_WEEKS,
  OVERVIEW_WEEK_OPTIONS,
} from '../constants/wellbeing.constants';
import type { AlertsWeek, LevelBucket } from '../types/wellbeing.types';

/** `?weeks=` không tin được (URL do người dùng sửa) → chỉ nhận các khoảng đã khai, ngoài ra rơi về mặc định. */
export function parseOverviewWeeks(raw: string): number {
  const weeks = Number(raw);
  return OVERVIEW_WEEK_OPTIONS.some((o) => Number(o.key) === weeks)
    ? weeks
    : OVERVIEW_DEFAULT_WEEKS;
}

/** Số đã LÀM TRÒN (BE làm tròn tới bội của 10) → hiện kèm "≈" để không ai đọc nó như số chính xác. */
export const formatApprox = (n: number): string => `≈ ${formatNumber(n)}`;

/** Ô đếm: `null` = bị che để khử nhận dạng → "—" (KHÔNG phải `0`, vì 0 là số thật "không có cảnh báo"). */
export const formatAlertCount = (alerts: number | null): string =>
  alerts === null ? NO_DATA : formatNumber(alerts);

/** Nhãn trục tuần của biểu đồ: `YYYY-MM-DD` (thứ Hai) → `DD/MM`. */
export const formatWeekLabel = (weekStart: string): string => formatDate(weekStart, 'DD/MM');

/** Có tuần nào phát sinh cảnh báo không — ô bị che (`null`) nghĩa là CÓ (1–4), nên tính là có. Toàn 0 thì hiện `EmptyState`, không vẽ cột phẳng. */
export const hasAlerts = (weeks: readonly AlertsWeek[]): boolean =>
  weeks.some((w) => w.alerts !== 0);

/** Có ít nhất một ô bị che — quyết định có hiện chú thích khử nhận dạng dưới biểu đồ/bảng không. */
export const hasSuppressedCell = (weeks: readonly AlertsWeek[]): boolean =>
  weeks.some((w) => w.alerts === null);

export interface LevelRow extends LevelBucket {
  /** Tỉ lệ trên tổng các nhóm đang công bố, thang 100. */
  share: number;
}

/** Thêm tỉ lệ cho từng nhóm; giữ thứ tự BE trả (Thấp → Trung bình → Cao → Khác). */
export function toLevelRows(buckets: readonly LevelBucket[]): LevelRow[] {
  const total = buckets.reduce((sum, b) => sum + b.count, 0);
  return buckets.map((b) => ({ ...b, share: total > 0 ? (b.count / total) * 100 : 0 }));
}
