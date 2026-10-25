import { memo, useMemo } from 'react';

import type { InsightsMetric, InsightsSeriesPoint } from '@/core/api/admin';
import { CompactKpiCard, Skeleton } from '@/shared/ui';
import { cn } from '@/shared/utils/style/cn';

import { NO_DATA } from '../constants/dashboard.constants';
import type { InsightKpiSpec } from '../constants/insights.constants';
import { computeDelta } from '../utils/insight-delta.utils';
import InsightDeltaBadge from './InsightDeltaBadge';
import InsightSparkline from './InsightSparkline';

export interface InsightKpiCardProps {
  spec: InsightKpiSpec;
  /** Số của kỳ hiện tại + kỳ trước. `undefined` = chưa có (đang tải) — thẻ hiện `—`, KHÔNG phải 0. */
  metric: InsightsMetric | undefined;
  /** Chuỗi theo ngày của kỳ hiện tại, vẽ sparkline. */
  series: readonly InsightsSeriesPoint[] | undefined;
  /** `true` = tắt hiệu ứng đếm số (giá trị hiện NGAY). */
  loading: boolean;
  /** Vừa đổi khoảng thời gian, số trên thẻ còn là của khoảng CŨ ⇒ làm mờ tới khi số mới về. */
  stale: boolean;
}

/**
 * Thẻ KPI có SO SÁNH KỲ TRƯỚC: số lớn · huy hiệu ▲▼ % · sparkline. Dựng trên `CompactKpiCard` (layout `stack`: nhãn trên, số dưới) — huy hiệu và
 * sparkline nằm ở `footer`, cùng một hàng, nên thẻ chỉ cao thêm đúng một dải 28px chứ không thành ba tầng.
 *
 * Chưa có số ⇒ `—` + khung chờ cùng cỡ ở chân thẻ (thẻ không nhảy cao khi dữ liệu về).
 */
const InsightKpiCard = memo(function InsightKpiCard({
  spec,
  metric,
  series,
  loading,
  stale,
}: InsightKpiCardProps) {
  const delta = useMemo(() => computeDelta(metric), [metric]);

  const footer = metric ? (
    <div className="flex items-center gap-2">
      <InsightDeltaBadge delta={delta} goodWhen={spec.goodWhen} previous={metric.previous} />
      <InsightSparkline data={series ?? []} label={`Xu hướng ${spec.label}`} token={spec.token} />
    </div>
  ) : (
    <div className="flex items-center gap-2">
      <Skeleton className="h-5 w-12 shrink-0" />
      <Skeleton className="h-7 min-w-0 flex-1" />
    </div>
  );

  return (
    <CompactKpiCard
      animate={!loading}
      className={cn('transition-opacity', stale && 'opacity-60')}
      color={spec.gem}
      footer={footer}
      icon={spec.icon}
      label={spec.label}
      layout="stack"
      value={metric ? metric.current : NO_DATA}
    />
  );
});

export default InsightKpiCard;
