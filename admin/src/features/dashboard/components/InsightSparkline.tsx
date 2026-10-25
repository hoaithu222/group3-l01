import { memo, useId, useMemo } from 'react';
import { Area, AreaChart, ResponsiveContainer, YAxis } from 'recharts';

import type { InsightsSeriesPoint } from '@/core/api/admin';
import { areaGradientPair, tokenVar } from '@/shared/charts';

export interface InsightSparklineProps {
  data: readonly InsightsSeriesPoint[];
  /** Token màu series scale `-5` (từ `INSIGHT_SERIES_COLORS`). */
  token: string;
  /** Mô tả cho trình đọc màn hình — sparkline không có trục/số nên phải có chữ thay thế. */
  label: string;
}

/**
 * Sparkline mini của thẻ KPI — chỉ ĐƯỜNG XU HƯỚNG (`chart-conventions.md §3.8`): không trục, không lưới, không tooltip, không nhãn số.
 * Cao CỐ ĐỊNH `h-7` (28px) để mọi thẻ cùng một nhịp; rộng theo cột chứa nó.
 *
 * Tắt animation vào: thẻ làm mới mỗi 60 s, mỗi lần để đường vẽ lại từ trái sang phải là chớp nháy vô nghĩa. Miền Y luôn bắt đầu từ 0 và có
 * trần ≥ 1 — chuỗi toàn 0 vẽ ra một đường phẳng ở đáy (số liệu thật: không có hoạt động), không bị kéo lên giữa khung.
 */
const InsightSparkline = memo(function InsightSparkline({ data, token, label }: InsightSparklineProps) {
  // `useId()` có dấu `:` làm hỏng cú pháp `url(#…)`; thiếu tiền tố riêng thì 8 thẻ cùng trang trùng id gradient.
  const rawId = useId();
  const gradId = `spark${rawId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const points = useMemo(() => data.map((p) => ({ date: p.date, count: p.count })), [data]);
  const [deep, bright] = areaGradientPair(token);

  if (points.length < 2) return <div aria-hidden className="h-7 min-w-0 flex-1" />;

  return (
    <div aria-label={label} className="h-7 min-w-0 flex-1" role="img">
      <ResponsiveContainer height="100%" width="100%">
        <AreaChart data={points} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={tokenVar(bright)} stopOpacity={0.5} />
              <stop offset="100%" stopColor={tokenVar(deep)} stopOpacity={0} />
            </linearGradient>
          </defs>
          <YAxis domain={[0, (max: number) => Math.max(max, 1)]} hide />
          <Area
            activeDot={false}
            dataKey="count"
            dot={false}
            fill={`url(#${gradId})`}
            isAnimationActive={false}
            stroke={tokenVar(bright)}
            strokeWidth={2}
            type="monotone"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
});

export default InsightSparkline;
