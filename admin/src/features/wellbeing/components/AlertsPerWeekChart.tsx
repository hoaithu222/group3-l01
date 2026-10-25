import { memo, useMemo } from 'react';
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
  fmt3,
  labelInt,
  tokenVar,
  tokenVarAlpha,
  useChartMetrics,
} from '@/shared/charts';
import { cn } from '@/shared/utils/style/cn';

import {
  WELLBEING_CHART_COLORS,
  WELLBEING_CHART_HEIGHT_CLASS,
} from '../constants/wellbeing.constants';
import type { AlertsWeek } from '../types/wellbeing.types';
import { formatWeekLabel } from '../utils/overview.utils';

export interface AlertsPerWeekChartProps {
  data: readonly AlertsWeek[];
}

/**
 * Cột "cảnh báo theo tuần" (admin.md p7-03 §2.1). Ô bị che (`alerts: null` — ít cảnh báo, khử nhận dạng) KHÔNG có cột: vẽ cột cao 0 sẽ đọc thành "không có cảnh báo".
 * Số chính xác của từng tuần và chú thích về ô bị che nằm ở bảng ngay bên dưới — cũng là bản thay thế cho trình đọc màn hình (vì vậy vùng vẽ để `aria-hidden`).
 * Rỗng (toàn 0) thì nơi dùng vẽ `EmptyState`, không vẽ cột phẳng.
 */
const AlertsPerWeekChart = memo(function AlertsPerWeekChart({ data }: AlertsPerWeekChartProps) {
  const uiScale = useDisplayStore(selectEffectiveUiScale);
  const [chartRef, m] = useChartMetrics<HTMLDivElement>(uiScale);
  const points = useMemo(
    () => data.map((w) => ({ week: formatWeekLabel(w.weekStart), alerts: w.alerts })),
    [data],
  );

  return (
    <div ref={chartRef} aria-hidden className={cn(WELLBEING_CHART_HEIGHT_CLASS, 'w-full')}>
      <ResponsiveContainer height="100%" width="100%">
        <BarChart data={points} margin={{ top: 16, right: 8, left: -12, bottom: 0 }}>
          <CartesianGrid {...m.grid} vertical={false} />
          <XAxis
            axisLine={m.axisLine}
            dataKey="week"
            interval="preserveStartEnd"
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
            cursor={{ fill: tokenVarAlpha(WELLBEING_CHART_COLORS.alerts, 0.08) }}
            formatter={(v) => [`${fmt3(Number(v)) || '0'} cảnh báo`, 'Cảnh báo']}
            itemStyle={m.tooltipItem}
            labelFormatter={(label) => `Tuần bắt đầu ${String(label)}`}
            labelStyle={m.tooltipLabel}
          />
          <Bar
            barSize={barSizeByCount(points.length)}
            dataKey="alerts"
            fill={tokenVar(WELLBEING_CHART_COLORS.alerts)}
            isAnimationActive={false}
          >
            <LabelList
              {...m.barLabel}
              dataKey="alerts"
              fill={tokenVar('fg-1')}
              formatter={(v) => labelInt(v === null || v === undefined ? null : Number(v))}
              position="top"
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
});

export default AlertsPerWeekChart;
