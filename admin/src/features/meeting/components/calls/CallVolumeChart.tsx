import { memo, useMemo } from 'react';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  LabelList,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { selectEffectiveUiScale, useDisplayStore } from '@/app/store';
import { fmt3, labelInt, tokenVar, tokenVarAlpha, useChartMetrics } from '@/shared/charts';
import { formatDate } from '@/shared/utils/format';
import { cn } from '@/shared/utils/style/cn';

import {
  CALL_CHART_COLORS,
  CALL_CHART_HEIGHT_CLASS,
  CALL_CHART_MAX_LABELED_BARS,
} from '../../constants/call-chart.constants';
import type { CallStatsDay } from '../../types/call.types';

export interface CallVolumeChartProps {
  data: readonly CallStatsDay[];
}

const dayLabel = (date: string): string => formatDate(date, 'DD/MM');

/**
 * Biểu đồ "Số cuộc gọi và phút gọi theo ngày" (admin.md p2-07 §2.3, P1): cột = số cuộc gọi (trục trái), đường = phút gọi (trục phải). Khung chuẩn
 * `chart-conventions.md §2`: số nguyên trên đỉnh cột (ẩn khi quá dày), tooltip có đơn vị. Ngày không có dữ liệu BE đã lấp 0.
 */
const CallVolumeChart = memo(function CallVolumeChart({ data }: CallVolumeChartProps) {
  const uiScale = useDisplayStore(selectEffectiveUiScale);
  const [chartRef, m] = useChartMetrics<HTMLDivElement>(uiScale);
  const chartData = useMemo(() => data.map((d) => ({ ...d })), [data]);
  const showLabels = chartData.length <= CALL_CHART_MAX_LABELED_BARS;

  return (
    <div ref={chartRef} className={cn(CALL_CHART_HEIGHT_CLASS, 'w-full')}>
      <ResponsiveContainer height="100%" width="100%">
        <ComposedChart data={chartData} margin={{ top: 16, right: 8, left: -20, bottom: 0 }}>
          <CartesianGrid {...m.grid} vertical={false} />
          <XAxis
            axisLine={m.axisLine}
            dataKey="date"
            interval="preserveStartEnd"
            tick={m.axisTick}
            tickFormatter={dayLabel}
            tickLine={false}
          />
          <YAxis
            allowDecimals={false}
            axisLine={false}
            tick={m.axisTick}
            tickLine={false}
            width={m.scale.yAxisWidth}
            yAxisId="calls"
          />
          <YAxis
            allowDecimals={false}
            axisLine={false}
            orientation="right"
            tick={m.axisTick}
            tickLine={false}
            width={m.scale.yAxisWidth}
            yAxisId="minutes"
          />
          <Tooltip
            contentStyle={m.tooltip}
            cursor={{ fill: tokenVarAlpha(CALL_CHART_COLORS.calls, 0.08) }}
            formatter={(v, name) => [
              `${fmt3(Number(v)) || '0'} ${name === 'minutes' ? 'phút' : 'cuộc'}`,
              name === 'minutes' ? 'Phút gọi' : 'Cuộc gọi',
            ]}
            itemStyle={m.tooltipItem}
            labelFormatter={(label) => dayLabel(String(label))}
            labelStyle={m.tooltipLabel}
          />
          <Legend
            formatter={(value) => (value === 'minutes' ? 'Phút gọi' : 'Cuộc gọi')}
            iconType="circle"
            wrapperStyle={m.legend}
          />
          <Bar dataKey="calls" fill={tokenVar(CALL_CHART_COLORS.calls)} yAxisId="calls">
            {showLabels && (
              <LabelList
                {...m.barLabel}
                dataKey="calls"
                fill={tokenVar(CALL_CHART_COLORS.calls)}
                formatter={(v) => labelInt(Number(v))}
                position="top"
              />
            )}
          </Bar>
          <Line
            dataKey="minutes"
            dot={false}
            stroke={tokenVar(CALL_CHART_COLORS.minutes)}
            strokeWidth={m.scale.lineWidth}
            type="monotone"
            yAxisId="minutes"
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
});

export default CallVolumeChart;
