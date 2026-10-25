/**
 * LiquidGauge — đồng hồ "mức nước": khối chất lỏng dâng tới phần trăm, mặt
 * nước gợn sóng chạy ngang.
 *
 * Bản SVG của `waterLevelPond` (DataV). Bản gốc vẽ bằng `<canvas>` và tự chạy
 * vòng lặp `requestAnimationFrame` suốt đời component; ở đây sóng là MỘT phần
 * tử SVG dịch ngang bằng CSS `animation`, nên:
 *   • trình duyệt tự dừng khi tab ẩn hoặc phần tử ngoài màn — không đốt CPU;
 *   • `prefers-reduced-motion` tắt được bằng đúng một khai báo CSS;
 *   • màu lấy từ token nên tự lật theo theme sáng/tối.
 *
 * ── Khi nào KHÔNG dùng ─────────────────────────────────────────────────────
 * Đây là đồ thị đọc THÔ, không đọc CHÍNH XÁC: mặt nước gợn sóng nên mắt không
 * chốt được "đúng 63%" từ hình. Nó hợp cho "bể còn khoảng hai phần ba" trên
 * màn treo tường. Cần con số chính xác thì `<ProgressCircle>` hoặc `<Progress>`
 * đúng hơn — và ở đây con số vẫn được in đè lên giữa chính vì lý do đó.
 */
import { memo, useId } from 'react';

import { cn } from '@/shared/utils/style/cn';

export type LiquidGaugeTone = 'sky' | 'teal' | 'green' | 'yellow' | 'orange' | 'red' | 'purple';
export type LiquidGaugeShape = 'circle' | 'roundRect' | 'rect';

export interface LiquidGaugeProps {
  /** Mức nước, thang 0–100. Ngoài dải sẽ bị kẹp lại. */
  value: number;
  tone?: LiquidGaugeTone;
  /** Hình khối chứa. Mặc định `circle`. */
  shape?: LiquidGaugeShape;
  /** Cạnh (px). Mặc định 120. */
  size?: number;
  /** Ẩn con số ở giữa. */
  hideValue?: boolean;
  /** Nhãn nhỏ dưới con số (vd `'Bể số 2'`). */
  label?: string;
  className?: string;
}

/** Biên độ sóng (px) — cố ý NHỎ: sóng cao che mất chính con số ở giữa. */
const WAVE_AMPLITUDE = 4;

const LiquidGauge = memo(function LiquidGauge({
  value,
  tone = 'sky',
  shape = 'circle',
  size = 120,
  hideValue = false,
  label,
  className,
}: LiquidGaugeProps) {
  // `useId` — nhiều gauge trên một trang mà trùng id thì clipPath của cái sau
  // ghi đè cái trước và mọi khối nước biến mất trừ một cái.
  const clipId = useId().replace(/:/g, '');
  const pct = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));

  // Mặt nước tính từ ĐÁY lên: 0% ⇒ y = size, 100% ⇒ y = 0.
  const waterY = size * (1 - pct / 100);
  const radius = shape === 'circle' ? size / 2 : shape === 'roundRect' ? 10 : 0;
  const stroke = `var(--color-${tone}-5)`;

  /**
   * Một chu kỳ sóng = hai cung bậc ba đối xứng, lặp lại đủ phủ `2 × size` bề
   * ngang. Dịch ngang đúng MỘT chu kỳ rồi lặp lại ⇒ mắt không thấy điểm nối.
   */
  const wave = `
    M0,${waterY}
    c${size / 4},-${WAVE_AMPLITUDE * 2} ${size / 4},${WAVE_AMPLITUDE * 2} ${size / 2},0
    c${size / 4},-${WAVE_AMPLITUDE * 2} ${size / 4},${WAVE_AMPLITUDE * 2} ${size / 2},0
    c${size / 4},-${WAVE_AMPLITUDE * 2} ${size / 4},${WAVE_AMPLITUDE * 2} ${size / 2},0
    c${size / 4},-${WAVE_AMPLITUDE * 2} ${size / 4},${WAVE_AMPLITUDE * 2} ${size / 2},0
    L${size * 2},${size} L0,${size} Z
  `;

  return (
    <div
      aria-label={label ? `${label}: ${pct}%` : `${pct}%`}
      aria-valuemax={100}
      aria-valuemin={0}
      aria-valuenow={pct}
      className={cn('relative shrink-0', className)}
      role="meter"
      style={{ width: size, height: size }}
    >
      <svg aria-hidden="true" height={size} viewBox={`0 0 ${size} ${size}`} width={size}>
        <defs>
          <clipPath id={clipId}>
            <rect height={size} rx={radius} ry={radius} width={size} x={0} y={0} />
          </clipPath>
        </defs>

        {/* Khối nước — `clipPath` cắt theo đúng hình vỏ ngoài. */}
        <g clipPath={`url(#${clipId})`}>
          <rect
            fill={`color-mix(in srgb, ${stroke} 8%, transparent)`}
            height={size}
            width={size}
            x={0}
            y={0}
          />
          <path
            className="[animation:liquid-wave_3s_linear_infinite] motion-reduce:animate-none"
            d={wave}
            fill={`color-mix(in srgb, ${stroke} 55%, transparent)`}
          />
          {/* Lớp sóng thứ HAI chạy chậm hơn và lệch pha — hai lớp giao nhau tạo
              cảm giác mặt nước thật; một lớp đơn đọc ra như một dải băng trượt. */}
          <path
            className="[animation:liquid-wave_4.5s_linear_infinite_reverse] motion-reduce:animate-none"
            d={wave}
            fill={`color-mix(in srgb, ${stroke} 30%, transparent)`}
          />
        </g>

        <rect
          fill="none"
          height={size - 2}
          rx={Math.max(0, radius - 1)}
          ry={Math.max(0, radius - 1)}
          stroke={stroke}
          strokeWidth={2}
          width={size - 2}
          x={1}
          y={1}
        />
      </svg>

      {!hideValue && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-h4-medium tabular-nums text-fg-1">{Math.round(pct)}%</span>
          {label && <span className="text-caption-10 text-fg-3">{label}</span>}
        </div>
      )}
    </div>
  );
});

export default LiquidGauge;
