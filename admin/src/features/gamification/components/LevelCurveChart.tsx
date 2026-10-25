import { memo } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { selectEffectiveUiScale, useDisplayStore } from '@/app/store';
import { fmt3, tokenVar, useChartMetrics } from '@/shared/charts';

/** Token màu đường XP tích luỹ. */
const LINE_COLOR = 'primary-5';

export interface LevelCurvePoint {
  level: number;
  cumulative: number;
}

export interface LevelCurveChartProps {
  data: readonly LevelCurvePoint[];
}

/** Biểu đồ đường nhỏ "XP tích luỹ theo cấp" cho tab Cấp độ (admin.md p4-03 §2.3). */
const LevelCurveChart = memo(function LevelCurveChart({ data }: LevelCurveChartProps) {
  const uiScale = useDisplayStore(selectEffectiveUiScale);
  const [chartRef, m] = useChartMetrics<HTMLDivElement>(uiScale);

  return (
    <div ref={chartRef} className="h-48 w-full">
      <ResponsiveContainer height="100%" width="100%">
        <LineChart data={[...data]} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid {...m.grid} vertical={false} />
          <XAxis axisLine={m.axisLine} dataKey="level" tick={m.axisTick} tickLine={false} />
          <YAxis
            axisLine={false}
            tick={m.axisTick}
            tickFormatter={(v) => fmt3(Number(v))}
            tickLine={false}
            width={m.scale.yAxisWidth}
          />
          <Tooltip
            contentStyle={m.tooltip}
            formatter={(v) => [`${fmt3(Number(v)) || '0'} XP`, 'XP tích luỹ']}
            itemStyle={m.tooltipItem}
            labelFormatter={(l) => `Cấp ${String(l)}`}
            labelStyle={m.tooltipLabel}
          />
          <Line
            dataKey="cumulative"
            dot={false}
            isAnimationActive={false}
            stroke={tokenVar(LINE_COLOR)}
            strokeWidth={2}
            type="monotone"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
});

export default LevelCurveChart;
