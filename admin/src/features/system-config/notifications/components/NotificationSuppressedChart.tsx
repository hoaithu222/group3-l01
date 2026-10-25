import { memo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { selectEffectiveUiScale, useDisplayStore } from '@/app/store';
import {
  barSizeByCount,
  labelInt,
  tokenVar,
  tokenVarAlpha,
  useChartMetrics,
} from '@/shared/charts';
import { EmptyState } from '@/shared/ui';
import { formatNumber } from '@/shared/utils/format';

import type { SuppressedPoint } from '../utils/notification-stats';

export interface NotificationSuppressedChartProps {
  points: readonly SuppressedPoint[];
}

/** Cột thể hiện SỐ ĐẾM — một màu (chart-conventions §1.2, token scale `-5`). */
const BAR_COLOR = 'warning-5';

/**
 * Biểu đồ cột "Push bị chặn theo lý do". Số đếm nằm cả trong danh sách `sr-only` bên dưới để
 * trình đọc màn hình (và test) đọc được giá trị thật mà không phụ thuộc hoạt ảnh của Recharts.
 */
const NotificationSuppressedChart = memo(function NotificationSuppressedChart({
  points,
}: NotificationSuppressedChartProps) {
  const uiScale = useDisplayStore(selectEffectiveUiScale);
  const [chartRef, m] = useChartMetrics<HTMLDivElement>(uiScale);
  const total = points.reduce((sum, p) => sum + p.count, 0);

  if (total === 0) {
    return (
      <EmptyState
        description="Không có push nào bị chặn trong khoảng này."
        icon="chart-line-bold"
        size="sm"
        title="Chưa có dữ liệu"
      />
    );
  }

  return (
    <div className="flex h-full w-full flex-col">
      <ul aria-label="Push bị chặn theo lý do" className="sr-only">
        {points.map((p) => (
          <li key={p.key}>{`${p.label}: ${formatNumber(p.count)}`}</li>
        ))}
      </ul>
      <div ref={chartRef} aria-hidden="true" className="h-full w-full">
        <ResponsiveContainer height="100%" width="100%">
          <BarChart data={[...points]} margin={{ top: 16, right: 8, left: -20, bottom: 0 }}>
            <CartesianGrid {...m.grid} vertical={false} />
            <XAxis
              axisLine={m.axisLine}
              dataKey="label"
              interval={0}
              tick={m.axisTick}
              tickLine={false}
            />
            <YAxis
              allowDecimals={false}
              axisLine={false}
              tick={m.axisTick}
              tickLine={false}
              width={m.scale.yAxisWidth}
            />
            <Tooltip
              contentStyle={m.tooltip}
              cursor={{ fill: tokenVarAlpha(BAR_COLOR, 0.08) }}
              formatter={(v) => [formatNumber(Number(v)), 'Số push']}
              itemStyle={m.tooltipItem}
              labelStyle={m.tooltipLabel}
            />
            <Bar barSize={barSizeByCount(points.length)} dataKey="count" fill={tokenVar(BAR_COLOR)}>
              <LabelList
                {...m.barLabel}
                dataKey="count"
                fill={tokenVar('fg-1')}
                formatter={(v) => labelInt(Number(v))}
                position="top"
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
});

export default NotificationSuppressedChart;
