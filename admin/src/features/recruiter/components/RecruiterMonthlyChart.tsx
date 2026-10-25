import { memo, useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { selectEffectiveUiScale, useDisplayStore } from '@/app/store';
import { fmt3, tokenVar, useChartMetrics } from '@/shared/charts';
import { EmptyState } from '@/shared/ui';

import { OFFER_SERIES } from '../constants/recruiter-chart.constants';
import type { MonthlyOfferStats } from '../types/recruiter.types';
import { periodLabel } from '../utils/stats.utils';

export interface RecruiterMonthlyChartProps {
  data: readonly MonthlyOfferStats[];
}

/**
 * Cột theo tháng: đã gửi / đã xem / quan tâm / từ chối / hết hạn (admin.md p6-08 §2.2). Kế hoạch ghi "cột CHỒNG" nhưng các số này CHỒNG LẤN nhau
 * (một lời mời đã xem rồi mới quan tâm thì đếm ở cả hai cột) — xếp chồng sẽ cộng trùng và đọc sai tổng; nên vẽ cột NHÓM cạnh nhau. Số liệu chính xác nằm ở
 * bảng ngay bên dưới (thay thế cho trình đọc màn hình — biểu đồ không có nội dung mà bảng không có).
 */
const RecruiterMonthlyChart = memo(function RecruiterMonthlyChart({
  data,
}: RecruiterMonthlyChartProps) {
  const uiScale = useDisplayStore(selectEffectiveUiScale);
  const [chartRef, m] = useChartMetrics<HTMLDivElement>(uiScale);
  const chartData = useMemo(() => data.map((d) => ({ ...d, label: periodLabel(d.period) })), [data]);

  if (chartData.length === 0) {
    return (
      <EmptyState
        description="Không có lời mời nào được gửi trong khoảng đã chọn."
        icon="chart-simple-bold"
        size="sm"
        title="Chưa có dữ liệu"
      />
    );
  }

  return (
    <div ref={chartRef} aria-hidden className="h-72 w-full">
      <ResponsiveContainer height="100%" width="100%">
        <BarChart data={chartData} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
          <CartesianGrid {...m.grid} vertical={false} />
          <XAxis axisLine={m.axisLine} dataKey="label" tick={m.axisTick} tickLine={false} />
          <YAxis
            allowDecimals={false}
            axisLine={false}
            tick={m.axisTick}
            tickLine={false}
            width={m.scale.yAxisWidth}
          />
          <Tooltip
            contentStyle={m.tooltip}
            formatter={(v, name) => [fmt3(Number(v)) || '0', String(name)]}
            itemStyle={m.tooltipItem}
            labelStyle={m.tooltipLabel}
          />
          <Legend wrapperStyle={m.legend} />
          {OFFER_SERIES.map((s) => (
            <Bar key={s.key} dataKey={s.key} fill={tokenVar(s.token)} name={s.label} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
});

export default RecruiterMonthlyChart;
