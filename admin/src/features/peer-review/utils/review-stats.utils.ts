import { AUTO_APPROVE_WARN_RATIO } from '../constants/peer-review.constants';
import type { ReviewStatsView } from '../types/peer-review.types';

/** Tỉ lệ lượt tự duyệt trên tổng lượt mở trong kỳ (0–1); chưa có lượt nào ⇒ 0 (không có gì để cảnh báo). */
export function autoApproveRatio(stats: Pick<ReviewStatsView, 'autoApprovedRounds' | 'roundsInPeriod'>): number {
  if (!(stats.roundsInPeriod > 0)) return 0;
  return Math.min(1, Math.max(0, stats.autoApprovedRounds / stats.roundsInPeriod));
}

/** Tỉ lệ tự duyệt vượt ngưỡng gợi ý (> 30 %) ⇒ nhóm có thể quá nhỏ cho số lượt duyệt đang đặt. */
export const isAutoApproveHigh = (
  stats: Pick<ReviewStatsView, 'autoApprovedRounds' | 'roundsInPeriod'>,
): boolean => autoApproveRatio(stats) > AUTO_APPROVE_WARN_RATIO;
