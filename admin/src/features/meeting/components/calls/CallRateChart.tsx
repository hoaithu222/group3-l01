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
import { formatDate } from '@/shared/utils/format';
import { cn } from '@/shared/utils/style/cn';

import { CALL_CHART_COLORS, CALL_CHART_HEIGHT_CLASS } from '../../constants/call-chart.constants';
import type { CallStatsDay } from '../../types/call.types';

export interface CallRateChartProps {
  data: readonly CallStatsDay[];
}

const dayLabel = (date: string): string => formatDate(date, 'DD/MM');
const SERIES_LABEL: Record<string, string> = {
  setup: 'Kết nối ≤ 20 giây',
  answer: 'Trả lời (đổ chuông)',
};

/**
 * Biểu đồ "Tỉ lệ kết nối và trả lời theo ngày" (admin.md p2-07 §2.3, P1): hai đường 0–100%. Ngày không có mẫu (BE trả `null`) để TRỐNG — nét đứt
 * khoảng trống thay vì kéo về 0% (0% là một con số thật, nói dối là "mọi cuộc đều lỗi"). Khung chuẩn `chart-conventions.md §2`.
 */
const CallRateChart = memo(function CallRateChart({ data }: CallRateChartProps) {
  const uiScale = useDisplayStore(selectEffectiveUiScale);
  const [chartRef, m] = useChartMetrics<HTMLDivElement>(uiScale);
  const chartData = useMemo(
    () =>
      data.map((d) => ({
        date: d.date,
        setup: d.setupSuccessRate === null ? null : d.setupSuccessRate * 100,
        answer: d.answerRate === null ? null : d.answerRate * 100,
      })),
    [data],
  );

  return (
    <div ref={chartRef} className={cn(CALL_CHART_HEIGHT_CLASS, 'w-full')}>
      <ResponsiveContainer height="100%" width="100%">
        <LineChart data={chartData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
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
            axisLine={false}
            domain={[0, 100]}
            tick={m.axisTick}
            tickFormatter={(v) => `${v}%`}
            tickLine={false}
            width={m.scale.yAxisWidth}
          />
          <Tooltip
            contentStyle={m.tooltip}
            cursor={{ stroke: tokenVar(CALL_CHART_COLORS.setupRate), strokeWidth: 1 }}
            formatter={(v, name) => [
              `${fmt3(Number(v)) || '0'}%`,
              SERIES_LABEL[String(name)] ?? String(name),
            ]}
            itemStyle={m.tooltipItem}
            labelFormatter={(label) => dayLabel(String(label))}
            labelStyle={m.tooltipLabel}
          />
          <Legend
            formatter={(value) => SERIES_LABEL[String(value)] ?? String(value)}
            iconType="line"
            wrapperStyle={m.legend}
          />
          <Line
            connectNulls={false}
            dataKey="setup"
            dot={{ r: m.scale.dotRadius }}
            stroke={tokenVar(CALL_CHART_COLORS.setupRate)}
            strokeWidth={m.scale.lineWidth}
            type="monotone"
          />
          <Line
            connectNulls={false}
            dataKey="answer"
            dot={{ r: m.scale.dotRadius }}
            stroke={tokenVar(CALL_CHART_COLORS.answerRate)}
            strokeDasharray="6 4"
            strokeWidth={m.scale.lineWidth}
            type="monotone"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
});

export default CallRateChart;
