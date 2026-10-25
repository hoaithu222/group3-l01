import { memo, useMemo } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { selectEffectiveUiScale, useDisplayStore } from '@/app/store';
import { fmt3, tokenVar, useChartMetrics } from '@/shared/charts';
import { EmptyState } from '@/shared/ui';

import type { WorkspaceStatDay } from '../types/workspace.types';

export interface WorkspaceStatsChartProps {
  data: readonly WorkspaceStatDay[];
}

const CHART_COLORS = { messages: 'sky-6', activeMembers: 'success-5' } as const;

/** Line chart "Tin nhắn / Thành viên hoạt động theo ngày" — khung chuẩn `chart-conventions.md §2`. */
const WorkspaceStatsChart = memo(function WorkspaceStatsChart({ data }: WorkspaceStatsChartProps) {
  const uiScale = useDisplayStore(selectEffectiveUiScale);
  const [chartRef, m] = useChartMetrics<HTMLDivElement>(uiScale);
  const chartData = useMemo(() => data.map((p) => ({ ...p })), [data]);

  if (chartData.length === 0) {
    return (
      <EmptyState
        description="Chưa đủ dữ liệu để vẽ biểu đồ — số liệu tính từ Message (p1-04), chưa có nguồn."
        icon="chart-line-bold"
        size="sm"
        title="Chưa có dữ liệu"
      />
    );
  }

  return (
    <div ref={chartRef} className="h-full w-full">
      <ResponsiveContainer height="100%" width="100%">
        <LineChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
          <CartesianGrid {...m.grid} vertical={false} />
          <XAxis axisLine={m.axisLine} dataKey="date" tick={m.axisTick} tickLine={false} />
          <YAxis axisLine={false} tick={m.axisTick} tickLine={false} width={m.scale.yAxisWidth} />
          <Tooltip
            contentStyle={m.tooltip}
            formatter={(v, name) => [
              `${fmt3(Number(v)) || '0'}`,
              name === 'messages' ? 'Tin nhắn' : 'Thành viên hoạt động',
            ]}
            itemStyle={m.tooltipItem}
            labelStyle={m.tooltipLabel}
          />
          <Line dataKey="messages" dot={false} stroke={tokenVar(CHART_COLORS.messages)} strokeWidth={2} type="monotone" />
          <Line
            dataKey="activeMembers"
            dot={false}
            stroke={tokenVar(CHART_COLORS.activeMembers)}
            strokeWidth={2}
            type="monotone"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
});

export default WorkspaceStatsChart;
