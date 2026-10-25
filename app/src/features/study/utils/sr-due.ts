import type { SrSummary } from '../api/sr.types';

/**
 * Số thẻ cần ôn HÔM NAY = thẻ đến hạn + thẻ MỚI còn trong ngân sách ngày (đúng số `GET /sr/due` sẽ đưa ra — `SrDueCard` và widget
 * ở tab Hoạt động cùng dùng hàm này để hai nơi không lệch số). Chưa có dữ liệu ⇒ 0.
 */
export function srDueCount(summary: Pick<SrSummary, 'dueToday' | 'newToday'> | undefined): number {
  return (summary?.dueToday ?? 0) + (summary?.newToday ?? 0);
}
