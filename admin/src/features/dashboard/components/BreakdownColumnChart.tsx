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
import { EmptyState } from '@/shared/ui';
import { formatNumber } from '@/shared/utils/format';

import type { InsightsBreakdownItem } from '@/core/api/admin';
import { LEVEL_COLUMN_COLOR } from '../constants/breakdown.constants';
import { buildBreakdownRows, sortByNumericKey } from '../utils/breakdown.utils';

export interface BreakdownColumnChartProps {
  /** `key` là số thứ tự (dạng chuỗi) — cột xếp TĂNG dần theo số đó, không theo số đếm. */
  items: readonly InsightsBreakdownItem[];
  /** Đơn vị cuối số trong tooltip ("người"). */
  unit: string;
  /** Tên chỉ số trong tooltip ("Số người"). */
  valueName: string;
  /** Tiền tố nhãn trục trong tooltip ("Cấp" → "Cấp 3"). */
  categoryName: string;
  /** Token màu cột (scale `-5`). Mặc định `LEVEL_COLUMN_COLOR`. */
  colorToken?: string;
  /** Câu hiện khi chưa có số nào > 0. */
  emptyText?: string;
}

/**
 * Cột dọc cho phân bố theo THỨ TỰ (cấp độ): một hue duy nhất — cấp độ là trục liên tục, tô mỗi cột một màu sẽ đọc như 10 loại khác nhau.
 * Số nguyên trên đỉnh cột (`LabelList`), tooltip có đơn vị — mẫu `AlertsPerWeekChart` (`chart-conventions.md §3.2.5`).
 * Cấp không có người không có cột (BE chỉ trả cấp có người), nên trục ngang chỉ ghi các cấp thật.
 */
const BreakdownColumnChart = memo(function BreakdownColumnChart({
  items,
  unit,
  valueName,
  categoryName,
  colorToken = LEVEL_COLUMN_COLOR,
  emptyText = 'Chưa có dữ liệu',
}: BreakdownColumnChartProps) {
  const uiScale = useDisplayStore(selectEffectiveUiScale);
  const [chartRef, m] = useChartMetrics<HTMLDivElement>(uiScale);
  const rows = useMemo(
    () => buildBreakdownRows(sortByNumericKey(items), {}, { ordered: true }),
    [items],
  );
  const color = tokenVar(colorToken);

  if (!rows.some((row) => row.count > 0)) {
    return <EmptyState description={emptyText} icon="chart-simple-bold" size="sm" title="Chưa có dữ liệu" />;
  }

  return (
    // `margin.left = 0`, không `-20` như khung mẫu: nhãn trục dọc ở đây vượt 1.000 ("5.000") nên lề âm cắt mất đầu nhãn.
    <div ref={chartRef} className="h-full w-full">
      <ResponsiveContainer height="100%" width="100%">
        <BarChart data={rows} margin={{ top: 16, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid {...m.grid} vertical={false} />
          <XAxis
            axisLine={m.axisLine}
            dataKey="label"
            interval={0}
            tick={m.axisTick}
            tickLine={false}
          />
          <YAxis
            allowDecimals={false}
            axisLine={false}
            tick={m.axisTick}
            tickFormatter={(v: number) => formatNumber(v)}
            tickLine={false}
            width={m.scale.yAxisWidth}
          />
          <Tooltip
            contentStyle={m.tooltip}
            cursor={{ fill: tokenVarAlpha(colorToken, 0.08) }}
            formatter={(v) => [`${fmt3(Number(v)) || '0'} ${unit}`, valueName]}
            itemStyle={m.tooltipItem}
            labelFormatter={(label) => `${categoryName} ${String(label)}`}
            labelStyle={m.tooltipLabel}
          />
          <Bar
            barSize={barSizeByCount(rows.length, 1.5)}
            dataKey="count"
            fill={color}
            isAnimationActive={false}
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
  );
});

export default BreakdownColumnChart;
