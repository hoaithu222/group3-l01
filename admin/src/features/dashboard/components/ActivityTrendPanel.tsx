import { memo, useCallback, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import type { AdminInsights } from '@/core/api/admin';
import { EmptyState, PanelCard, SegmentToggle, Skeleton } from '@/shared/ui';
import { cn } from '@/shared/utils/style/cn';

import { TREND_METRICS } from '../constants/insights.constants';
import type { TrendMetricKey } from '../types/insights.types';
import {
  availableTrendMetrics,
  buildTrendRows,
  hasTrendActivity,
  seriesRangeLabel,
  trendKpi,
} from '../utils/insight-series.utils';
import { summarizeOverviewSeries } from '../utils/overview-series.utils';
import ActivityTrendChart from './ActivityTrendChart';
import ActivityTrendLegend from './ActivityTrendLegend';
import SeriesSummaryStats from './SeriesSummaryStats';

export interface ActivityTrendPanelProps {
  insights: AdminInsights | undefined;
  /** Đang tải LẦN ĐẦU (chưa có số nào) ⇒ khung chờ đúng hình khối, không nhảy bố cục khi số về. */
  loading: boolean;
  /** Đang đổi khoảng thời gian: hình cũ còn đó, chờ số mới ⇒ làm mờ (`opacity-60`) thay vì nháy trắng hay hiện số 0. */
  stale: boolean;
}

/**
 * Panel HERO của trang Tổng quan — biểu đồ xu hướng nhiều chỉ số, so với kỳ trước.
 *
 * Bộ chọn chỉ liệt kê chỉ số BE có chuỗi (`availableTrendMetrics`): chuỗi vắng = cờ phân hệ tắt, không phải "toàn số 0", nên không đưa vào chọn.
 * Chỉ số đang chọn mà biến mất (cờ vừa tắt) ⇒ rơi về chỉ số đầu còn lại. Chỉ số đang chọn là trạng thái cục bộ — chỉ KHOẢNG THỜI GIAN mới sống
 * trên URL (`useInsightsRange`).
 *
 * Header: tóm tắt TB/ngày · cao nhất · thấp nhất của CHỈ SỐ ĐANG CHỌN. Toàn 0 ở cả hai kỳ ⇒ trạng thái rỗng, không vẽ đường phẳng.
 */
const ActivityTrendPanel = memo(function ActivityTrendPanel({
  insights,
  loading,
  stale,
}: ActivityTrendPanelProps) {
  const [picked, setPicked] = useState<TrendMetricKey>('activeUsers');
  const available = useMemo(() => availableTrendMetrics(insights), [insights]);
  const metric: TrendMetricKey = available.includes(picked) ? picked : (available[0] ?? picked);
  const spec = TREND_METRICS[metric];

  const current = insights?.series[metric];
  const previous = insights?.previousSeries?.[metric];
  const rows = useMemo(() => buildTrendRows(current ?? [], previous), [current, previous]);
  const summary = useMemo(() => summarizeOverviewSeries(current ?? []), [current]);
  const options = useMemo(
    () => available.map((key) => ({ key, label: TREND_METRICS[key].shortLabel })),
    [available],
  );
  const hasActivity = hasTrendActivity(rows);

  const handlePick = useCallback((key: string) => setPicked(key as TrendMetricKey), []);

  let body: ReactNode;
  if (!insights) {
    body = loading ? (
      <div className="flex h-full min-h-0 flex-col gap-2">
        <Skeleton className="h-8 w-80 max-w-full" />
        <Skeleton className="min-h-48 w-full flex-1" />
      </div>
    ) : (
      <EmptyState
        description="Số liệu phân tích chưa tải được."
        icon="chart-line-bold"
        size="sm"
        title="Chưa có dữ liệu xu hướng"
      />
    );
  } else {
    body = (
      <div className={cn('flex h-full min-h-0 flex-col gap-2 transition-opacity', stale && 'opacity-60')}>
        <div className="min-w-0 shrink-0 overflow-x-auto">
          <SegmentToggle
            aria-label="Chỉ số xem xu hướng"
            options={options}
            size="sm"
            skin="primary"
            value={metric}
            variant="pill"
            onValueChange={handlePick}
          />
        </div>
        {hasActivity ? (
          <>
            <ActivityTrendLegend
              average={summary?.average}
              currentRange={seriesRangeLabel(current ?? [])}
              previousRange={seriesRangeLabel(previous ?? [])}
              token={spec.token}
              total={trendKpi(insights, metric)}
            />
            <div className="min-h-0 flex-1">
              <ActivityTrendChart
                average={summary?.average}
                rows={rows}
                token={spec.token}
                unit={spec.unit}
              />
            </div>
          </>
        ) : (
          <EmptyState
            description={`Chưa có ${spec.label.toLowerCase()} nào trong kỳ này và kỳ trước.`}
            icon="chart-line-bold"
            size="sm"
            title="Chưa có hoạt động"
          />
        )}
      </div>
    );
  }

  return (
    <PanelCard
      frame="default"
      right={summary && hasActivity ? <SeriesSummaryStats summary={summary} /> : undefined}
      title="Xu hướng hoạt động"
      titleNote={rows.length > 0 ? `${rows.length} ngày` : undefined}
      tone="sky"
    >
      {body}
    </PanelCard>
  );
});

export default ActivityTrendPanel;
