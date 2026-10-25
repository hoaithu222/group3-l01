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
import { barSizeByCount, labelInt, tokenVar, tokenVarAlpha, useChartMetrics } from '@/shared/charts';
import { BoxPanel, EmptyState } from '@/shared/ui';
import { formatDate, formatNumber } from '@/shared/utils/format';

import { PROJECT_CHART_COLORS } from '../constants/workspace-projects.constants';
import type { ProjectDoneWeek } from '../types/workspace-projects.types';

export interface ProjectDoneByWeekChartProps {
  data: readonly ProjectDoneWeek[];
}

/** Biểu đồ cột "Thẻ hoàn thành theo tuần" (8 tuần) — khung chuẩn `chart-conventions.md`. */
const ProjectDoneByWeekChart = memo(function ProjectDoneByWeekChart({
  data,
}: ProjectDoneByWeekChartProps) {
  const uiScale = useDisplayStore(selectEffectiveUiScale);
  const [chartRef, m] = useChartMetrics<HTMLDivElement>(uiScale);
  const points = useMemo(
    () => data.map((w) => ({ week: formatDate(w.weekStart, 'DD/MM'), count: w.count })),
    [data],
  );

  return (
    <BoxPanel border="hairline" className="h-auto" title="Thẻ hoàn thành theo tuần">
      <div className="h-56 p-2">
        {points.length === 0 ? (
          <EmptyState
            description="Chưa có thẻ nào hoàn thành trong 8 tuần gần đây."
            icon="chart-line-bold"
            size="sm"
            title="Chưa có dữ liệu"
          />
        ) : (
          <div ref={chartRef} className="h-full w-full">
            <ResponsiveContainer height="100%" width="100%">
              <BarChart data={points} margin={{ top: 16, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid {...m.grid} vertical={false} />
                <XAxis axisLine={m.axisLine} dataKey="week" interval={0} tick={m.axisTick} tickLine={false} />
                <YAxis
                  allowDecimals={false}
                  axisLine={false}
                  tick={m.axisTick}
                  tickLine={false}
                  width={m.scale.yAxisWidth}
                />
                <Tooltip
                  contentStyle={m.tooltip}
                  cursor={{ fill: tokenVarAlpha(PROJECT_CHART_COLORS.done, 0.08) }}
                  formatter={(v) => [`${formatNumber(Number(v))} thẻ`, 'Hoàn thành']}
                  itemStyle={m.tooltipItem}
                  labelFormatter={(label) => `Tuần bắt đầu ${String(label)}`}
                  labelStyle={m.tooltipLabel}
                />
                <Bar
                  barSize={barSizeByCount(points.length)}
                  dataKey="count"
                  fill={tokenVar(PROJECT_CHART_COLORS.done)}
                >
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
        )}
      </div>
    </BoxPanel>
  );
});

export default ProjectDoneByWeekChart;
