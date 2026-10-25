import { memo, useId } from 'react';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { selectEffectiveUiScale, useDisplayStore } from '@/app/store';
import { areaGradientPair, tokenVar, tokenVarAlpha, useChartMetrics } from '@/shared/charts';

import { INSIGHT_PREVIOUS_TOKEN } from '../constants/insights.constants';
import type { TrendRow } from '../types/insights.types';
import { formatAxisNumber } from '../utils/insight-series.utils';
import { formatSeriesDayTick } from '../utils/overview-series.utils';
import ActivityTrendTooltip from './ActivityTrendTooltip';

export interface ActivityTrendChartProps {
  rows: TrendRow[];
  /** Token màu series scale `-5` của chỉ số đang chọn. */
  token: string;
  /** Đơn vị hiện ở tooltip ("người", "tin nhắn"…). */
  unit: string;
  /** Trung bình/ngày của kỳ hiện tại — vạch tham chiếu. Không truyền ⇒ không vẽ. */
  average?: number;
}

/**
 * Biểu đồ HERO của trang Tổng quan — khung chuẩn `chart-conventions.md §2`. Kỳ này = Area (gradient `-5`→`-6`) + nét liền; kỳ trước = nét ĐỨT xám
 * (`fg-4`, cùng quy ước "đứt = để so, liền = thực tế" của §3.7); vạch trung bình = nét liền mảnh nhạt màu series; tooltip nêu cả hai kỳ + chênh lệch.
 *
 * ⚠️ `margin.left = 0`, KHÔNG `-20` như khung mẫu: số liệu vượt 1.000 nên nhãn trục dài 5 ký tự, lề âm cắt mất đầu nhãn (đã gặp: "1.200" đọc ra "200").
 * Trục Y chỉ nhận số nguyên (`allowDecimals={false}`) — đếm người/tin nhắn không có "2,5".
 *
 * Trần mật độ `large`: panel HERO cao vì BỐ CỤC, không phải vì người dùng bấm phóng to — tự nhảy `xlarge` (trục 16px, nét 4px) là chữ trục to hơn
 * cả chữ bảng bên cạnh. Chart cha phải cho wrapper một chiều cao xác định (`h-full` + `min-h-*`) — `useChartMetrics` đo chính nó.
 */
const ActivityTrendChart = memo(function ActivityTrendChart({
  rows,
  token,
  unit,
  average,
}: ActivityTrendChartProps) {
  const uiScale = useDisplayStore(selectEffectiveUiScale);
  const [chartRef, m] = useChartMetrics<HTMLDivElement>(uiScale, 'large');
  // `useId()` có dấu `:` làm hỏng cú pháp `url(#…)`.
  const gradId = `activityTrend${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const [deep, bright] = areaGradientPair(token);
  const series = tokenVar(bright);

  return (
    <div ref={chartRef} className="h-full min-h-48 w-full">
      <ResponsiveContainer height="100%" width="100%">
        <ComposedChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={series} stopOpacity={0.55} />
              <stop offset="100%" stopColor={tokenVar(deep)} stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <CartesianGrid {...m.grid} vertical={false} />
          <XAxis
            axisLine={m.axisLine}
            dataKey="date"
            minTickGap={16}
            tick={m.axisTick}
            tickFormatter={formatSeriesDayTick}
            tickLine={false}
          />
          <YAxis
            allowDecimals={false}
            axisLine={false}
            tick={m.axisTick}
            tickFormatter={formatAxisNumber}
            tickLine={false}
            width={m.scale.yAxisWidth}
          />
          <Tooltip
            content={<ActivityTrendTooltip style={m.tooltip} token={token} unit={unit} />}
            cursor={{ stroke: series, strokeWidth: 1 }}
          />
          {average !== undefined && (
            <ReferenceLine
              ifOverflow="extendDomain"
              stroke={tokenVarAlpha(bright, 0.6)}
              strokeWidth={1}
              y={average}
            />
          )}
          <Area
            activeDot={{ r: m.scale.activeDotRadius, strokeWidth: 0, fill: series }}
            animationDuration={500}
            dataKey="current"
            dot={false}
            fill={`url(#${gradId})`}
            stroke={series}
            strokeWidth={m.scale.lineWidth}
            type="monotone"
          />
          <Line
            activeDot={false}
            animationDuration={500}
            dataKey="previous"
            dot={false}
            stroke={tokenVar(INSIGHT_PREVIOUS_TOKEN)}
            strokeDasharray="6 4"
            strokeWidth={Math.max(1, m.scale.lineWidth - 1)}
            type="monotone"
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
});

export default ActivityTrendChart;
