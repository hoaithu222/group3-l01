import { memo, useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
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
  LEVEL_LABELS,
  WELLBEING_CHART_COLORS,
  WELLBEING_CHART_HEIGHT_CLASS,
} from '../constants/wellbeing.constants';
import type { LevelBucket } from '../types/wellbeing.types';

export interface LevelDistributionChartProps {
  data: readonly LevelBucket[];
}

/**
 * Cột ngang "phân bố mức hiện tại" — mỗi nhóm một cột, màu theo mức (Thấp xanh · Trung bình cam · Cao đỏ · Khác tím). Nhóm nhỏ đã được BE gộp vào "Khác" để khử nhận dạng,
 * nên cột nào hiện ra cũng có đủ người. Số chính xác + tỉ lệ nằm ở bảng bên dưới (bản thay thế cho trình đọc màn hình — vùng vẽ để `aria-hidden`).
 */
const LevelDistributionChart = memo(function LevelDistributionChart({
  data,
}: LevelDistributionChartProps) {
  const uiScale = useDisplayStore(selectEffectiveUiScale);
  const [chartRef, m] = useChartMetrics<HTMLDivElement>(uiScale);
  const points = useMemo(
    () => data.map((b) => ({ level: b.level, label: LEVEL_LABELS[b.level], count: b.count })),
    [data],
  );

  return (
    <div ref={chartRef} aria-hidden className={cn(WELLBEING_CHART_HEIGHT_CLASS, 'w-full')}>
      <ResponsiveContainer height="100%" width="100%">
        <BarChart
          data={points}
          layout="vertical"
          margin={{ top: 4, right: 36, left: 4, bottom: 0 }}
        >
          <CartesianGrid {...m.grid} horizontal={false} />
          <XAxis
            allowDecimals={false}
            axisLine={false}
            tick={m.axisTick}
            tickLine={false}
            type="number"
          />
          <YAxis
            axisLine={m.axisLine}
            dataKey="label"
            tick={m.axisTick}
            tickLine={false}
            type="category"
            width={Math.max(m.scale.yAxisWidth, 76)}
          />
          <Tooltip
            contentStyle={m.tooltip}
            cursor={{ fill: tokenVarAlpha('primary-5', 0.08) }}
            formatter={(v) => [`${fmt3(Number(v)) || '0'} người`, 'Số người']}
            itemStyle={m.tooltipItem}
            labelStyle={m.tooltipLabel}
          />
          <Bar barSize={barSizeByCount(points.length)} dataKey="count" isAnimationActive={false}>
            {points.map((p) => (
              <Cell key={p.level} fill={tokenVar(WELLBEING_CHART_COLORS[p.level])} />
            ))}
            <LabelList
              {...m.barLabel}
              dataKey="count"
              fill={tokenVar('fg-1')}
              formatter={(v) => labelInt(Number(v))}
              position="right"
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
});

export default LevelDistributionChart;
