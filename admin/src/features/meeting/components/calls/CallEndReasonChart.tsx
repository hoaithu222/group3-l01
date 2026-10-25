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
import { fmt3, labelInt, tokenVar, tokenVarAlpha, useChartMetrics } from '@/shared/charts';
import { EmptyState } from '@/shared/ui';
import { statusBadge } from '@/shared/utils/format';
import { cn } from '@/shared/utils/style/cn';

import { CALL_CHART_COLORS, CALL_CHART_HEIGHT_CLASS } from '../../constants/call-chart.constants';
import type { CallStats } from '../../types/call.types';

export interface CallEndReasonChartProps {
  data: CallStats['byEndReason'];
}

/** Bề rộng tối thiểu trục nhãn — nhãn lý do ("Quản trị kết thúc") dài hơn số nên vượt `yAxisWidth` mặc định. */
const CATEGORY_AXIS_MIN_WIDTH = 104;

/**
 * Biểu đồ "Lý do kết thúc" (admin.md p2-07 §2.3, P1): thanh ngang theo số cuộc gọi, đã sắp giảm dần ở BE. Nhãn lấy từ `statusBadge('callEndReason')`
 * (cùng chữ với bảng); số nguyên cuối thanh, tooltip có đơn vị. Không có dữ liệu → khung rỗng. Khung chuẩn `chart-conventions.md §3.5`.
 */
const CallEndReasonChart = memo(function CallEndReasonChart({ data }: CallEndReasonChartProps) {
  const uiScale = useDisplayStore(selectEffectiveUiScale);
  const [chartRef, m] = useChartMetrics<HTMLDivElement>(uiScale);
  const chartData = useMemo(
    () => data.map((r) => ({ name: statusBadge('callEndReason', r.reason).label, count: r.count })),
    [data],
  );

  if (chartData.length === 0) {
    return (
      <EmptyState
        description="Chưa có cuộc gọi nào kết thúc trong khoảng thời gian này."
        icon="chart-simple-bold"
        size="sm"
        title="Chưa có dữ liệu"
      />
    );
  }

  return (
    <div ref={chartRef} className={cn(CALL_CHART_HEIGHT_CLASS, 'w-full')}>
      <ResponsiveContainer height="100%" width="100%">
        <BarChart
          data={chartData}
          layout="vertical"
          margin={{ top: 4, right: 28, left: 4, bottom: 0 }}
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
            dataKey="name"
            interval={0}
            tick={m.axisTick}
            tickLine={false}
            type="category"
            width={Math.max(m.scale.yAxisWidth, CATEGORY_AXIS_MIN_WIDTH)}
          />
          <Tooltip
            contentStyle={m.tooltip}
            cursor={{ fill: tokenVarAlpha(CALL_CHART_COLORS.reasons, 0.08) }}
            formatter={(v) => [`${fmt3(Number(v)) || '0'} cuộc`, 'Số cuộc gọi']}
            itemStyle={m.tooltipItem}
            labelStyle={m.tooltipLabel}
          />
          <Bar dataKey="count" fill={tokenVar(CALL_CHART_COLORS.reasons)}>
            <LabelList
              {...m.barLabel}
              dataKey="count"
              fill={tokenVar(CALL_CHART_COLORS.reasons)}
              formatter={(v) => labelInt(Number(v))}
              position="right"
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
});

export default CallEndReasonChart;
