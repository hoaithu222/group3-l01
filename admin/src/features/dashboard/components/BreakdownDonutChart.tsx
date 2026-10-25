import { memo, useId, useMemo } from 'react';

import { areaGradientPair, tokenVar } from '@/shared/charts';
import { formatNumber } from '@/shared/utils/format';
import { cn } from '@/shared/utils/style/cn';

import type { InsightsBreakdownItem } from '@/core/api/admin';
import { DONUT_RING_RADIUS, DONUT_RING_WIDTH } from '../constants/breakdown.constants';
import {
  buildBreakdownRows,
  formatShare,
  type BreakdownColorOf,
} from '../utils/breakdown.utils';

export interface BreakdownDonutChartProps {
  items: readonly InsightsBreakdownItem[];
  /** Mã BE → nhãn tiếng Việt (mã lạ hiện nguyên mã). */
  labels: Readonly<Record<string, string>>;
  /** Số tổng hiện ở tâm. Tổng các lát = 0 thì tâm hiện "—" (0 là một con số thật, "chưa có dữ liệu" thì không). */
  centerValue: number;
  /** Đơn vị dưới số tổng ("tài khoản", "cuộc gọi"…) — không có đơn vị thì số trần khó hiểu. */
  centerLabel: string;
  /** Mặc định tô theo thứ hạng (`seriesTokenAt`) — truyền vào khi màu phải theo mã hoặc theo ngữ nghĩa. */
  colorOf?: BreakdownColorOf;
  /** Cỡ do nơi dùng quyết (vd `size-24`) — component KHÔNG tự đặt, để không khoá cứng cả hai chiều. */
  className?: string;
}

/**
 * Donut phân bổ — nhiều lát + track `divider-1` + số tổng ở tâm.
 *
 * ⛔ VẼ BẰNG SVG THUẦN, KHÔNG dùng `<Pie>` của recharts (cùng lý do với `@/shared/widgets/charts/ProgressDonutChart`): trang này có
 * 3–4 donut nằm cùng lúc, recharts 3 giữ cỡ trong store nội bộ nạp qua effect nên đổi cỡ hàng loạt (cửa sổ co giãn, bảng
 * điều hướng đóng/mở) có thể làm vành biến mất cho tới khi rê chuột. Bản này scale bằng `viewBox` — không đo đạc, không state, không có
 * khung hình nào vẽ sai cỡ. Đổi lại không có tooltip riêng: tên + số + % của từng lát nằm trong `BreakdownLegend` cạnh nó và trong `<title>`
 * (tooltip gốc của trình duyệt) của từng lát.
 *
 * Quy ước donut theo `chart-conventions.md §3.1`: liền mạch, không vách ngăn (`butt`, không `paddingAngle`); track `divider-1` vẽ
 * TRƯỚC để vành rỗng vẫn nhìn thấy; lát tô gradient cùng hue `-6 → -5` (§1.3, mảng lớn trên nền navy bị loá). Chữ ở tâm dùng `fg-*`,
 * không tô màu series (§1.7).
 *
 * Trợ năng: cả vành là một `role="img"` có `aria-label` nêu số tổng; chi tiết từng lát là bản chữ ở `BreakdownLegend`.
 */
const BreakdownDonutChart = memo(function BreakdownDonutChart({
  items,
  labels,
  centerValue,
  centerLabel,
  colorOf,
  className,
}: BreakdownDonutChartProps) {
  const uid = useId();
  const rows = useMemo(() => buildBreakdownRows(items, labels, { colorOf }), [items, labels, colorOf]);

  const circumference = 2 * Math.PI * DONUT_RING_RADIUS;
  const total = useMemo(() => rows.reduce((sum, row) => sum + row.count, 0), [rows]);
  const slices = useMemo(() => {
    let offset = 0;
    return rows
      .filter((row) => row.count > 0)
      .map((row) => {
        const span = (row.count / total) * circumference;
        const slice = { ...row, span, offset };
        offset += span;
        return slice;
      });
  }, [rows, total, circumference]);

  // Mốc gradient đặt đúng mép TRONG (-6, đậm) và mép NGOÀI (-5, sáng) của vành, tính trên bán kính 50 của `viewBox`.
  const innerStop = `${((DONUT_RING_RADIUS - DONUT_RING_WIDTH / 2) / 50) * 100}%`;
  const outerStop = `${((DONUT_RING_RADIUS + DONUT_RING_WIDTH / 2) / 50) * 100}%`;
  const centerText = total > 0 ? formatNumber(centerValue) : '—';

  return (
    <div
      aria-label={`${centerLabel}: ${total > 0 ? centerText : 'chưa có dữ liệu'}`}
      className={cn('relative shrink-0', className)}
      role="img"
    >
      <svg aria-hidden className="absolute inset-0 size-full" viewBox="0 0 100 100">
        <defs>
          {slices.map((slice, i) => {
            const [deep, bright] = areaGradientPair(slice.colorToken);
            return (
              <radialGradient
                key={slice.key}
                cx="50"
                cy="50"
                gradientUnits="userSpaceOnUse"
                id={`${uid}-${i}`}
                r="50"
              >
                <stop offset={innerStop} stopColor={tokenVar(deep)} />
                <stop offset={outerStop} stopColor={tokenVar(bright)} />
              </radialGradient>
            );
          })}
        </defs>

        {/* Track — chrome, cố ý contrast thấp. Vẽ TRƯỚC: tổng = 0 vẫn còn một vành để nhìn. */}
        <circle
          cx="50"
          cy="50"
          fill="none"
          r={DONUT_RING_RADIUS}
          stroke={tokenVar('divider-1')}
          strokeWidth={DONUT_RING_WIDTH}
        />

        {/* `rotate(-90)`: đường tròn SVG khởi hành ở 3 giờ — xoay để lát đầu bắt đầu từ ĐỈNH và chạy thuận chiều kim đồng hồ. */}
        <g transform="rotate(-90 50 50)">
          {slices.map((slice, i) => (
            <circle
              key={slice.key}
              cx="50"
              cy="50"
              fill="none"
              r={DONUT_RING_RADIUS}
              stroke={`url(#${uid}-${i})`}
              strokeDasharray={`${slice.span} ${circumference - slice.span}`}
              strokeDashoffset={-slice.offset}
              strokeWidth={DONUT_RING_WIDTH}
            >
              <title>{`${slice.label}: ${formatNumber(slice.count)} (${formatShare(slice.percent)})`}</title>
            </circle>
          ))}
        </g>
      </svg>

      <div className="pointer-events-none absolute inset-0 grid place-items-center">
        <div className="flex max-w-[62%] flex-col items-center text-center leading-tight">
          <span className="text-body-14-bold tabular-nums text-fg-1">{centerText}</span>
          <span className="text-caption-12 text-fg-4">{centerLabel}</span>
        </div>
      </div>
    </div>
  );
});

export default BreakdownDonutChart;
