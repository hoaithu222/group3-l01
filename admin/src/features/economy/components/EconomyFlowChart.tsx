import { memo, useMemo } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { selectEffectiveUiScale, useDisplayStore } from '@/app/store';
import { fmt3, tokenVar, useChartMetrics } from '@/shared/charts';
import { cn } from '@/shared/utils/style/cn';

import {
  ECONOMY_CHART_COLORS,
  ECONOMY_CHART_HEIGHT_CLASS,
  ECONOMY_SERIES_LABELS,
} from '../constants/economy.constants';
import type { EconomyDayPoint } from '../types/economy.types';
import { formatDayLabel } from '../utils/economy-format.utils';

export interface EconomyFlowChartProps {
  data: readonly EconomyDayPoint[];
}

/**
 * Đường "xu phát hành" và "xu đã tiêu" theo ngày (admin.md p7-02 §2.1). Khung chuẩn `chart-conventions.md §2`: chữ/nét theo bậc mật độ, tooltip có đơn vị.
 * Đường KHÔNG có nhãn số trên điểm (`§3.2.5`: line mật độ cao thì bỏ) — số chính xác từng ngày nằm ở bảng ngay bên dưới, cũng là bản thay thế cho
 * trình đọc màn hình (vì vậy vùng vẽ để `aria-hidden`). Rỗng thì nơi dùng vẽ `EmptyState`, không vẽ đường phẳng bằng 0.
 */
const EconomyFlowChart = memo(function EconomyFlowChart({ data }: EconomyFlowChartProps) {
  const uiScale = useDisplayStore(selectEffectiveUiScale);
  const [chartRef, m] = useChartMetrics<HTMLDivElement>(uiScale);
  const chartData = useMemo(() => data.map((d) => ({ ...d })), [data]);

  return (
    <div ref={chartRef} aria-hidden className={cn(ECONOMY_CHART_HEIGHT_CLASS, 'w-full')}>
      <ResponsiveContainer height="100%" width="100%">
        <LineChart data={chartData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
          <CartesianGrid {...m.grid} vertical={false} />
          <XAxis
            axisLine={m.axisLine}
            dataKey="date"
            interval="preserveStartEnd"
            tick={m.axisTick}
            tickFormatter={formatDayLabel}
            tickLine={false}
          />
          <YAxis
            allowDecimals={false}
            axisLine={false}
            tick={m.axisTick}
            tickFormatter={(v) => fmt3(Number(v)) || '0'}
            tickLine={false}
            width={m.scale.yAxisWidth}
          />
          <Tooltip
            contentStyle={m.tooltip}
            formatter={(v, name) => [
              `${fmt3(Number(v)) || '0'} xu`,
              ECONOMY_SERIES_LABELS[String(name)] ?? String(name),
            ]}
            itemStyle={m.tooltipItem}
            labelFormatter={(label) => formatDayLabel(String(label))}
            labelStyle={m.tooltipLabel}
          />
          <Legend
            formatter={(value) => ECONOMY_SERIES_LABELS[String(value)] ?? String(value)}
            iconType="line"
            wrapperStyle={m.legend}
          />
          <Line
            dataKey="issued"
            dot={false}
            isAnimationActive={false}
            stroke={tokenVar(ECONOMY_CHART_COLORS.issued)}
            strokeWidth={m.scale.lineWidth}
            type="monotone"
          />
          <Line
            dataKey="spent"
            dot={false}
            isAnimationActive={false}
            stroke={tokenVar(ECONOMY_CHART_COLORS.spent)}
            strokeWidth={m.scale.lineWidth}
            type="monotone"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
});

export default EconomyFlowChart;
