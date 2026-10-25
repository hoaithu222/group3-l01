import { memo } from 'react';

import { SummaryCard } from '@/shared/ui';
import { formatNumber } from '@/shared/utils/format';

import { REVIEW_OVERDUE_HOURS } from '../constants/peer-review.constants';
import type { ReviewStatsView } from '../types/peer-review.types';
import { isAutoApproveHigh } from '../utils/review-stats.utils';

export interface ReviewKpiGridProps {
  stats: ReviewStatsView;
  /** Cửa sổ (ngày) của các số đếm theo kỳ — chỉ để ghi vào nhãn. */
  days: number;
}

/**
 * Năm thẻ KPI của khối Chấm chéo (p4-05 admin.md §2.2): lượt đang mở, lượt chờ quá 72 giờ, thời gian chấm trung vị,
 * lượt tự duyệt do thiếu người, lượt được miễn chấm. Toàn số đếm — không chữ nào lấy từ nội dung lượt chấm.
 */
const ReviewKpiGrid = memo(function ReviewKpiGrid({ stats, days }: ReviewKpiGridProps) {
  const median = stats.medianHoursToSubmit;

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
      <SummaryCard
        animate={false}
        color="blue"
        description={`${formatNumber(stats.pendingReviews)} lượt đang chờ người chấm nộp`}
        icon="clipboard-check-bold"
        label="Lượt chấm đang mở"
        value={stats.openRounds}
      />
      <SummaryCard
        animate={false}
        color={stats.overdue72h > 0 ? 'red' : 'gray'}
        icon="clock-bold"
        label={`Lượt chờ quá ${REVIEW_OVERDUE_HOURS} giờ`}
        value={stats.overdue72h}
      />
      <SummaryCard
        animate={false}
        color="gray"
        description={median === null ? `Chưa có lượt nộp nào trong ${days} ngày` : undefined}
        icon="chart-line-bold"
        label="Thời gian chấm trung vị"
        value={median === null ? '—' : `${formatNumber(median, 1)} giờ`}
      />
      <SummaryCard
        animate={false}
        color={isAutoApproveHigh(stats) ? 'yellow' : 'gray'}
        description={`Trên ${formatNumber(stats.roundsInPeriod)} lượt mở (${days} ngày)`}
        icon="user-check-bold"
        label="Lượt tự duyệt do thiếu người"
        value={stats.autoApprovedRounds}
      />
      <SummaryCard
        animate={false}
        color="gray"
        icon="shield-check-bold"
        label={`Lượt được miễn chấm (${days} ngày)`}
        value={stats.waivedRounds}
      />
    </div>
  );
});

export default ReviewKpiGrid;
