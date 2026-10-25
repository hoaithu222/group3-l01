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
import { barSizeByCount, tokenVar, tokenVarAlpha, useChartMetrics } from '@/shared/charts';
import { EmptyState } from '@/shared/ui';
import { formatFileSize, formatNumber } from '@/shared/utils/format';

import { CHART_COLORS, labelOf, STORAGE_SCOPE_LABELS } from '../constants/storage.constants';
import type { StorageBucket } from '../types/storage.types';
import { pickByteUnit } from '../utils/byte-unit';

export interface StorageByScopeChartProps {
  data: readonly StorageBucket[];
}

interface ScopePoint {
  name: string;
  /** Dung lượng đã đổi sang đơn vị chung của trục (KB/MB/GB…) — xem `pickByteUnit`. */
  value: number;
  count: number;
}

/**
 * Biểu đồ cột "Dung lượng theo phạm vi" (scope). Đơn vị của chart này là BYTE nên nhãn/tooltip dùng
 * `formatFileSize` thay cho `labelInt`/`fmt3` (số nguyên thô như `52.428.800` không ai đọc được), còn
 * trục dùng một đơn vị chung đã chọn sẵn để vạch chia tròn.
 */
const StorageByScopeChart = memo(function StorageByScopeChart({ data }: StorageByScopeChartProps) {
  const uiScale = useDisplayStore(selectEffectiveUiScale);
  const [chartRef, m] = useChartMetrics<HTMLDivElement>(uiScale);

  const { points, unit, divisor } = useMemo(() => {
    const rows = data.filter((b) => b.bytes > 0).sort((a, b) => b.bytes - a.bytes);
    const picked = pickByteUnit(rows[0]?.bytes ?? 0);
    const scoped = rows.map<ScopePoint>((b) => ({
      name: labelOf(STORAGE_SCOPE_LABELS, b.key),
      value: b.bytes / picked.divisor,
      count: b.count,
    }));
    return { points: scoped, ...picked };
  }, [data]);

  if (points.length === 0) {
    return (
      <EmptyState
        description="Chưa có tệp nào được tải lên."
        icon="chart-line-bold"
        size="sm"
        title="Chưa có dữ liệu"
      />
    );
  }

  return (
    <div ref={chartRef} className="h-full w-full">
      <ResponsiveContainer height="100%" width="100%">
        <BarChart data={points} margin={{ top: 16, right: 8, left: -20, bottom: 0 }}>
          <CartesianGrid {...m.grid} vertical={false} />
          <XAxis
            axisLine={m.axisLine}
            dataKey="name"
            interval={0}
            tick={m.axisTick}
            tickLine={false}
          />
          <YAxis
            axisLine={false}
            tick={m.axisTick}
            tickFormatter={(v: number) => formatNumber(v, v % 1 === 0 ? 0 : 1)}
            tickLine={false}
            unit={` ${unit}`}
            width={Math.max(m.scale.yAxisWidth, 60)}
          />
          <Tooltip
            contentStyle={m.tooltip}
            cursor={{ fill: tokenVarAlpha(CHART_COLORS.bytes, 0.08) }}
            formatter={(v, _name, item) => [
              `${formatFileSize(Number(v) * divisor)} · ${formatNumber((item.payload as ScopePoint).count)} tệp`,
              'Dung lượng',
            ]}
            itemStyle={m.tooltipItem}
            labelStyle={m.tooltipLabel}
          />
          <Bar
            barSize={barSizeByCount(points.length)}
            dataKey="value"
            fill={tokenVar(CHART_COLORS.bytes)}
          >
            <LabelList
              {...m.barLabel}
              dataKey="value"
              fill={tokenVar('fg-1')}
              formatter={(v) => formatFileSize(Number(v) * divisor)}
              position="top"
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
});

export default StorageByScopeChart;
