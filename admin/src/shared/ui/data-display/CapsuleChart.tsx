/**
 * CapsuleChart — dải thanh ngang KÈM TRỤC chia độ.
 *
 * Bản DOM của `capsuleChart` (DataV). Nó nằm giữa hai thứ base đã có:
 *
 *   `<Progress>`      một giá trị, so với 100 — không có trục, không so ngang.
 *   `<RankingBoard>`  nhiều giá trị, so với NHAU — không có trục, không đọc
 *                     được con số tuyệt đối từ độ dài.
 *   `<CapsuleChart>`  nhiều giá trị, có TRỤC ⇒ đọc được cả tỉ lệ lẫn con số.
 *
 * Trục là điểm khác biệt và cũng là lý do tồn tại: không có trục, một thanh dài
 * 70% chỉ nói "nhiều hơn cái 40%", còn có trục thì nó nói "khoảng 3.500".
 *
 * ── Mốc chia độ ────────────────────────────────────────────────────────────
 * Bản gốc chia đúng 5 khoảng đều nhau từ 0 tới giá trị lớn nhất, nên trục hay
 * ra những con số lẻ đọc không nổi (0 · 1.437 · 2.874 …). Ở đây mốc được LÀM
 * TRÒN LÊN bội số đẹp (1 · 2 · 5 × 10ⁿ) trước khi chia — trục ra 0 · 1.000 ·
 * 2.000 · 3.000 · 4.000, thứ mà mắt cộng nhẩm được.
 */
import { memo, useEffect, useMemo, useState } from 'react';

import { usePrefersReducedMotion } from '@/shared/hooks';
import { formatNumber } from '@/shared/utils/format/format.utils';
import { cn } from '@/shared/utils/style/cn';

export interface CapsuleChartItem {
  id: string;
  label: string;
  value: number;
}

export type CapsuleChartTone = 'sky' | 'teal' | 'green' | 'yellow' | 'orange' | 'red' | 'purple';

export interface CapsuleChartProps {
  items: readonly CapsuleChartItem[];
  /**
   * Trần của trục. Bỏ trống ⇒ tự lấy giá trị lớn nhất rồi làm tròn lên mốc đẹp.
   *
   * Truyền tay khi các thanh đo theo CHỈ TIÊU chứ không theo nhau — vd chỉ tiêu
   * quý là 5.000 thì `max={5000}`, nhờ vậy "chưa ai đạt" nhìn ra ngay thay vì
   * người cao nhất luôn chạm mép.
   */
  max?: number;
  /** Số mốc trên trục (không kể mốc 0). Mặc định 4. */
  ticks?: number;
  tone?: CapsuleChartTone;
  /** Hiện con số ở cuối mỗi thanh. Mặc định BẬT. */
  showValue?: boolean;
  /** Đơn vị in ở góc phải trục (vd `'tấn'`). */
  unit?: string;
  valueFormat?: (value: number) => string;
  disableAnimation?: boolean;
  className?: string;
}

/**
 * Làm tròn LÊN mốc "đẹp": 1 · 2 · 5 nhân luỹ thừa 10.
 *
 * 1.437 → 2.000 · 34 → 50 · 6.100 → 10.000. Nhờ vậy mọi mốc trên trục đều là
 * số chia hết cho `ticks` phần và đọc ra là số tròn.
 */
function niceCeil(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 1;
  const exp = Math.floor(Math.log10(value));
  const pow = 10 ** exp;
  const frac = value / pow;
  const nice = frac <= 1 ? 1 : frac <= 2 ? 2 : frac <= 5 ? 5 : 10;
  return nice * pow;
}

const CapsuleChart = memo(function CapsuleChart({
  items,
  max,
  ticks = 4,
  tone = 'sky',
  showValue = true,
  unit,
  valueFormat = formatNumber,
  disableAnimation = false,
  className,
}: CapsuleChartProps) {
  const reducedMotion = usePrefersReducedMotion();
  const still = disableAnimation || reducedMotion;

  const axisMax = useMemo(() => {
    if (max != null && Number.isFinite(max) && max > 0) return max;
    const peak = Math.max(0, ...items.map((i) => (Number.isFinite(i.value) ? i.value : 0)));
    return niceCeil(peak);
  }, [items, max]);

  const tickValues = useMemo(
    () => Array.from({ length: ticks + 1 }, (_, i) => (axisMax / ticks) * i),
    [axisMax, ticks],
  );

  // Xem ghi chú cùng tên ở `RankingBoard`: CSS không nội suy giá trị khởi tạo.
  const [grown, setGrown] = useState(false);
  useEffect(() => {
    if (still) return;
    setGrown(false);
    const frame = requestAnimationFrame(() => setGrown(true));
    return () => cancelAnimationFrame(frame);
  }, [items, still]);

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {items.map((item) => {
        const pct = Math.max(0, Math.min(100, (item.value / axisMax) * 100));
        return (
          <div key={item.id} className="flex items-center gap-2">
            <span className="w-24 shrink-0 truncate text-right text-caption-12 text-fg-2">
              {item.label}
            </span>

            {/* Rãnh bo tròn hết cỡ = hình "viên nang" mà tên component nói tới. */}
            <div className="h-2.5 min-w-0 flex-1 rounded-full bg-bg-2">
              <div
                className={cn(
                  'h-full rounded-full',
                  !still && 'transition-[width] duration-[900ms] ease-out',
                )}
                style={{
                  width: still || grown ? `${pct}%` : '0%',
                  background: `linear-gradient(to right, color-mix(in srgb, var(--color-${tone}-5) 40%, transparent), var(--color-${tone}-5))`,
                }}
              />
            </div>

            {showValue && (
              <span className="w-16 shrink-0 text-right text-caption-12-medium tabular-nums text-fg-1">
                {valueFormat(item.value)}
              </span>
            )}
          </div>
        );
      })}

      {/* Trục — thụt trái đúng bằng cột nhãn, thụt phải đúng bằng cột giá trị,
          nếu không mốc 0 và mốc cuối sẽ không thẳng với hai đầu thanh. */}
      <div className="flex items-center gap-2">
        <span className="w-24 shrink-0" />
        <div className="flex min-w-0 flex-1 justify-between text-caption-10 tabular-nums text-fg-4">
          {tickValues.map((t) => (
            <span key={t}>{valueFormat(t)}</span>
          ))}
        </div>
        <span className="w-16 shrink-0 text-right text-caption-10 text-fg-4">{unit}</span>
      </div>
    </div>
  );
});

export default CapsuleChart;
