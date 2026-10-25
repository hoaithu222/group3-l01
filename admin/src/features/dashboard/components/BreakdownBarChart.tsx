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
  tokenVar,
  tokenVarAlpha,
  useChartMetrics,
} from '@/shared/charts';
import { EmptyState } from '@/shared/ui';
import { formatNumber } from '@/shared/utils/format';

import type { InsightsBreakdownItem } from '@/core/api/admin';
import { BAR_CHART_MARGIN_RIGHT } from '../constants/breakdown.constants';
import {
  buildBreakdownRows,
  categoryAxisWidth,
  maxLabelChars,
  truncateLabel,
  type BreakdownColorOf,
} from '../utils/breakdown.utils';

export interface BreakdownBarChartProps {
  items: readonly InsightsBreakdownItem[];
  /** Mã BE → nhãn tiếng Việt (mã lạ hiện nguyên mã). */
  labels: Readonly<Record<string, string>>;
  /** Đơn vị cuối số trong tooltip ("XP", "báo cáo") — số trần không nói được nó đếm cái gì. */
  unit: string;
  /** Tên chỉ số trong tooltip ("Tổng XP", "Số báo cáo"). */
  valueName: string;
  /** Mặc định tô theo thứ hạng (`seriesTokenAt`) — truyền vào khi màu phải theo ngữ nghĩa. */
  colorOf?: BreakdownColorOf;
  /** Chỉ vẽ top-N dòng (sau khi sắp giảm dần). */
  limit?: number;
  /** Câu hiện khi chưa có số nào > 0. */
  emptyText?: string;
}

/**
 * Thanh ngang xếp GIẢM dần — mẫu `CallEndReasonChart` / `LevelDistributionChart` (`chart-conventions.md §3.5`): `layout="vertical"`, số nguyên
 * cuối thanh (`LabelList`), tooltip có đơn vị, mỗi thanh một `Cell`.
 *
 * Trục danh mục tự đo theo nhãn dài nhất (`categoryAxisWidth`) thay vì một con số cứng: "Hoàn thành đúng hạn" cần ~130px còn "Chờ xử lý" chỉ ~75px — số
 * cứng thì hoặc cắt nhãn dài hoặc phí chỗ của thanh ở panel hẹp. Nhãn vượt trần (46% bề ngang) bị cắt "…", tên đầy đủ nằm ở tooltip.
 * Số 0 vẫn in "0" (khác `labelInt` ẩn 0): dòng có nhãn mà không có thanh lẫn số sẽ đọc như dữ liệu bị mất.
 */
const BreakdownBarChart = memo(function BreakdownBarChart({
  items,
  labels,
  unit,
  valueName,
  colorOf,
  limit,
  emptyText = 'Chưa có dữ liệu',
}: BreakdownBarChartProps) {
  const uiScale = useDisplayStore(selectEffectiveUiScale);
  const [chartRef, m] = useChartMetrics<HTMLDivElement>(uiScale);
  const rows = useMemo(
    () => buildBreakdownRows(items, labels, { colorOf, limit }),
    [items, labels, colorOf, limit],
  );
  const axisWidth = categoryAxisWidth(rows, m.scale.axis, m.width, m.scale.yAxisWidth);
  const labelChars = maxLabelChars(axisWidth, m.scale.axis);

  if (!rows.some((row) => row.count > 0)) {
    return <EmptyState description={emptyText} icon="chart-simple-bold" size="sm" title="Chưa có dữ liệu" />;
  }

  return (
    <div ref={chartRef} className="h-full w-full">
      <ResponsiveContainer height="100%" width="100%">
        <BarChart
          data={rows}
          layout="vertical"
          margin={{ top: 4, right: BAR_CHART_MARGIN_RIGHT, left: 4, bottom: 0 }}
        >
          <CartesianGrid {...m.grid} horizontal={false} />
          <XAxis
            allowDecimals={false}
            axisLine={false}
            tick={m.axisTick}
            tickFormatter={(v: number) => formatNumber(v)}
            tickLine={false}
            type="number"
          />
          <YAxis
            axisLine={m.axisLine}
            dataKey="label"
            interval={0}
            tick={m.axisTick}
            tickFormatter={(v: string) => truncateLabel(v, labelChars)}
            tickLine={false}
            type="category"
            width={axisWidth}
          />
          <Tooltip
            contentStyle={m.tooltip}
            cursor={{ fill: tokenVarAlpha('primary-5', 0.08) }}
            formatter={(v) => [`${fmt3(Number(v)) || '0'} ${unit}`, valueName]}
            itemStyle={m.tooltipItem}
            labelStyle={m.tooltipLabel}
          />
          <Bar barSize={barSizeByCount(rows.length)} dataKey="count" isAnimationActive={false}>
            {rows.map((row) => (
              <Cell key={row.key} fill={tokenVar(row.colorToken)} />
            ))}
            <LabelList
              {...m.barLabel}
              dataKey="count"
              fill={tokenVar('fg-1')}
              formatter={(v) => formatNumber(Number(v))}
              position="right"
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
});

export default BreakdownBarChart;
