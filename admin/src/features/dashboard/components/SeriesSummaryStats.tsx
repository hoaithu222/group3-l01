import { memo } from 'react';

import { formatNumber } from '@/shared/utils/format';
import { cn } from '@/shared/utils/style/cn';

import type { OverviewSeriesSummary } from '../utils/overview-series.utils';

/** Một cặp nhãn–số trên header panel biểu đồ ("TB/ngày 1.050"). */
function SummaryStat({
  label,
  value,
  className,
}: {
  label: string;
  value: number;
  className?: string;
}) {
  return (
    <span className={cn('flex items-baseline gap-1 whitespace-nowrap', className)}>
      <span className="text-caption-12 text-fg-4">{label}</span>
      <span className="text-caption-12-semibold tabular-nums text-fg-1">{formatNumber(value)}</span>
    </span>
  );
}

export interface SeriesSummaryStatsProps {
  summary: OverviewSeriesSummary;
}

/** Cụm số tóm tắt chuỗi của chỉ số đang chọn — đọc được xu hướng mà không phải rê chuột lên từng điểm. */
const SeriesSummaryStats = memo(function SeriesSummaryStats({ summary }: SeriesSummaryStatsProps) {
  return (
    <span className="flex items-center gap-3 pr-1 max-sm:hidden">
      <SummaryStat label="TB/ngày" value={summary.average} />
      <SummaryStat label="Cao nhất" value={summary.peak.count} />
      {/* Màn hẹp: bỏ "Thấp nhất" (< lg); điện thoại (< sm) ẩn cả cụm — tên panel quan trọng hơn, số vẫn đọc được trên biểu đồ. */}
      <SummaryStat className="max-lg:hidden" label="Thấp nhất" value={summary.low.count} />
    </span>
  );
});

export default SeriesSummaryStats;
