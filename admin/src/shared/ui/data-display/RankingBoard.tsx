/**
 * RankingBoard — bảng xếp hạng: số thứ tự, tên, thanh dài theo giá trị.
 *
 * Bản DOM của `scrollRankingBoard` (DataV). Khác biệt cốt lõi so với việc chỉ
 * xếp `<Progress>` chồng lên nhau: THANH ĐO THEO GIÁ TRỊ LỚN NHẤT trong bộ dữ
 * liệu, không theo 100. Hạng nhất luôn chạm mép phải, nên mắt so được TỈ LỆ
 * GIỮA CÁC HẠNG — đó mới là câu hỏi người ta hỏi một bảng xếp hạng ("nhất hơn
 * nhì bao nhiêu"), chứ không phải "đạt bao nhiêu phần trăm chỉ tiêu".
 *
 * ⚠️ Muốn so với CHỈ TIÊU thì đây là component SAI — dùng `<Progress>` hoặc
 *    `<CapsuleChart max={…}>`. Ở bảng này, một bộ dữ liệu toàn số bé (5, 4, 3)
 *    vẫn cho hạng nhất một thanh đầy, và đó là đúng ý đồ.
 *
 * Thanh VẼ RA từ 0 khi bảng hiện lên — cùng lý do với số đếm lên: mắt bắt được
 * thứ vừa thay đổi. Máy bật `prefers-reduced-motion` thì thanh hiện thẳng ở độ
 * dài cuối.
 */
import { memo, useEffect, useMemo, useState } from 'react';

import { usePrefersReducedMotion } from '@/shared/hooks';
import { formatNumber } from '@/shared/utils/format/format.utils';
import { cn } from '@/shared/utils/style/cn';

import AnimatedNumber from './AnimatedNumber';

export interface RankingBoardItem {
  /** Khoá ổn định — KHÔNG dùng chỉ số mảng, thứ hạng đổi là key đổi theo. */
  id: string;
  label: string;
  value: number;
}

export type RankingBoardTone = 'sky' | 'teal' | 'green' | 'yellow' | 'orange' | 'red' | 'purple';

export interface RankingBoardProps {
  items: readonly RankingBoardItem[];
  /** Tông màu thanh. Mặc định `sky`. */
  tone?: RankingBoardTone;
  /**
   * Ba hạng đầu tô màu nhấn riêng (vàng · lam · cam của bục trao giải).
   * Mặc định BẬT — đó là thứ làm bảng đọc được trong một cái liếc.
   */
  highlightTop?: boolean;
  /** Đổi cách in giá trị. Mặc định `formatNumber`. */
  valueFormat?: (value: number) => string;
  /** Tắt hiệu ứng thanh vẽ ra + số đếm lên. */
  disableAnimation?: boolean;
  className?: string;
}

/**
 * ⛔ Class phải viết LITERAL, KHÔNG ghép chuỗi (`border-${tone}-5`).
 *
 * Tailwind v4 quét mã nguồn như VĂN BẢN THUẦN: tên class chỉ tồn tại sau khi
 * JavaScript chạy thì scanner không thấy gì để sinh, và huy hiệu thứ hạng im
 * lặng mất sạch màu. Đây là cùng cái bẫy đã ghi ở `FormGrid`.
 *
 * (Ngược lại, `var(--color-${tone}-5)` trong INLINE STYLE thì an toàn: đó là
 * biến CSS do `generated-colors.css` khai sẵn, không phải class Tailwind.)
 */
const RANK_BADGE: Record<RankingBoardTone, string> = {
  sky: 'border-sky-5 bg-sky-5/20 text-sky-5',
  teal: 'border-teal-5 bg-teal-5/20 text-teal-5',
  green: 'border-green-5 bg-green-5/20 text-green-5',
  yellow: 'border-yellow-5 bg-yellow-5/20 text-yellow-5',
  orange: 'border-orange-5 bg-orange-5/20 text-orange-5',
  red: 'border-red-5 bg-red-5/20 text-red-5',
  purple: 'border-purple-5 bg-purple-5/20 text-purple-5',
};

/** Màu ba hạng đầu — cố định, KHÔNG theo `tone`: đó là ý nghĩa thứ hạng. */
const TOP_TONE: readonly RankingBoardTone[] = ['yellow', 'sky', 'orange'];

const RankingBoard = memo(function RankingBoard({
  items,
  tone = 'sky',
  highlightTop = true,
  valueFormat = formatNumber,
  disableAnimation = false,
  className,
}: RankingBoardProps) {
  const reducedMotion = usePrefersReducedMotion();
  const still = disableAnimation || reducedMotion;

  /**
   * Khung hình ĐẦU vẽ mọi thanh ở 0, khung sau mới đặt độ dài thật — không có
   * bước này thì thanh sinh ra đã đúng độ dài và `transition` không có gì để
   * chạy (CSS chỉ nội suy khi giá trị ĐỔI, không nội suy giá trị khởi tạo).
   */
  const [grown, setGrown] = useState(false);
  useEffect(() => {
    if (still) return;
    setGrown(false);
    const frame = requestAnimationFrame(() => setGrown(true));
    return () => cancelAnimationFrame(frame);
  }, [items, still]);

  /**
   * Mẫu số là giá trị LỚN NHẤT, chặn sàn 1 để không chia cho 0.
   *
   * `Math.max()` trên mảng rỗng trả `-Infinity`, và mọi phép chia sau đó ra
   * `NaN` — chiều rộng `NaN%` bị trình duyệt bỏ qua nên thanh biến mất mà
   * không có lỗi nào trên console.
   */
  const max = useMemo(
    () => Math.max(1, ...items.map((i) => (Number.isFinite(i.value) ? i.value : 0))),
    [items],
  );

  return (
    <ol className={cn('flex flex-col gap-1.5', className)}>
      {items.map((item, i) => {
        const barTone = highlightTop && i < 3 ? TOP_TONE[i] : tone;
        const pct = Math.max(0, Math.min(100, (item.value / max) * 100));

        return (
          <li key={item.id} className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className={cn(
                'flex size-5 shrink-0 items-center justify-center border',
                'text-caption-10-medium tabular-nums',
                highlightTop && i < 3 ? RANK_BADGE[barTone] : 'border-border-1 bg-bg-2 text-fg-3',
              )}
            >
              {i + 1}
            </span>

            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-caption-12 text-fg-1">{item.label}</span>
                <span className="shrink-0 text-caption-12-medium text-fg-1">
                  <AnimatedNumber disabled={still} format={valueFormat} value={item.value} />
                </span>
              </div>

              <div className="h-1.5 w-full bg-bg-2">
                <div
                  className={cn('h-full', !still && 'transition-[width] duration-[900ms] ease-out')}
                  style={{
                    // 900ms trùng đúng thời lượng mặc định của `useCountUp`, nên
                    // thanh và con số dừng CÙNG LÚC — mắt đọc ra một chuyển động
                    // duy nhất chứ không phải hai thứ rời rạc lệch nhịp.
                    width: still || grown ? `${pct}%` : '0%',
                    background: `linear-gradient(to right, color-mix(in srgb, var(--color-${barTone}-5) 45%, transparent), var(--color-${barTone}-5))`,
                    boxShadow: `0 0 8px -2px var(--color-${barTone}-5)`,
                  }}
                />
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
});

export default RankingBoard;
