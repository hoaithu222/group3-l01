/**
 * @file ProgressDonutChart.tsx
 * @description Vòng % tiến độ kiểu donut — track ring `divider-1` vẽ trước + cung
 * dữ liệu + đĩa nền ở tâm + % ở tâm. KHÔNG kèm label/count (card cha tự hiển thị).
 *
 * Trước đây sống ở `features/categories-components/.../ReportDonutChart.tsx`.
 * Promote lên `shared/widgets` khi tab Thống kê nghiệm thu cần ĐÚNG vòng này:
 * hai feature không cùng module parent nên không được import chéo
 * (`feature-structure.md`), mà nhân đôi thì mọi bug đã sửa ở đây phải sửa lần hai.
 *
 * ⛔ VẼ BẰNG SVG THUẦN, KHÔNG dùng recharts (ngoại lệ có chủ đích với
 * `chart-conventions.md §0` + `§3.1.5`). Đây là VÒNG TIẾN ĐỘ một giá trị, không
 * phải biểu đồ dữ liệu — không trục, không tooltip, không legend, không series.
 *
 * Lý do bỏ, theo đúng thứ tự đã thử và thất bại (2026-08-21):
 *
 *  1. **Bug:** đổi cỡ card 50% ↔ 75% là ~20 card resize một nhịp ⇒ vòng biến mất,
 *     rê chuột vào mới hiện lại. Mất CẢ track ring (vốn `isAnimationActive={false}`)
 *     lẫn cung ⇒ hỏng ở tầng recharts chứ không phải ở animation.
 *  2. Đổi `<ResponsiveContainer>` sang tự đo bằng `useElementSize` rồi truyền
 *     `width`/`height` SỐ cho `<PieChart>` — **vẫn lỗi**. Recharts 3 giữ cỡ trong
 *     store nội bộ nạp qua effect, nên vẫn còn nguyên một lớp state có thể lệch với
 *     DOM; bất kỳ re-render nào (rê chuột) là nó tự khớp lại.
 *  3. Bằng chứng quyết định: hai lớp overlay SVG THUẦN của chính file này (đĩa nền,
 *     chữ %) **chưa bao giờ mất** qua đúng thao tác đó. Chúng scale bằng `viewBox`,
 *     không đo đạc, không state.
 *
 * Đổi lại còn được: bỏ hẳn ResizeObserver + store của recharts cho MỖI card (lưới
 * 20+ card), và vòng scale bằng `viewBox` nên không có frame nào vẽ sai cỡ.
 *
 * ⛔ Component KHÔNG tự đặt cỡ — call-site truyền qua `className`
 * (`aspect-square h-full` + trần `max-h-*`). Tự đặt `size-full` ở đây sẽ khoá
 * cứng cả 2 chiều và vô hiệu hoá `aspect-square` của call-site.
 *
 * ⛔ KHÔNG neon: đã gỡ `drop-shadow` quanh cung và `text-shadow` của chữ %. Quầng
 * sáng làm nhoè cạnh cung và làm chữ % mất nét trên nền tối — đúng thứ nó định làm
 * nổi bật. Đĩa nền mờ ở tâm thì GIỮ: nó là nền đỡ chữ, không phải hiệu ứng loé.
 *
 * Track ring luôn vẽ (`divider-1`) — vành rỗng đọc ra "0%", vành MẤT đọc ra "lỗi".
 * Bản trước tô phần "thiếu" bằng `bg-3` (màu nền) nên trên card cùng tông, phần
 * thiếu TÀNG HÌNH — mọi donut trông như đạt ~100% dù thực tế đạt rất thấp.
 *
 * Cung tô gradient `-6 → -5` cùng hue (§1.3, chống loá mảng lớn trên nền navy).
 */
import { memo, useId } from 'react';

import { tokenVar, tokenVarAlpha } from '@/shared/charts';
import { cn } from '@/shared/utils/style/cn';

/**
 * Hình học vành, quy ra hệ toạ độ `viewBox` 100×100 — GIỮ ĐÚNG số cũ của recharts
 * (`innerRadius="74%"` · `outerRadius="95%"` tính trên bán kính 50):
 * ngoài 47,5 · trong 37 ⇒ nét dày 10,5 · tâm nét ở bán kính 42,25.
 * Vẽ bằng `stroke` nên chỉ cần MỘT đường tròn cho cả vành.
 */
const RING_RADIUS = 42.25;
const RING_WIDTH = 10.5;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

/**
 * % làm tròn tới `decimals` chữ số thập phân; số nguyên bỏ đuôi ".0" (100% thay vì
 * 100.0%).
 *
 * Định nghĩa TẠI CHỖ chứ không import `fmtPercent` của feature: `shared/` không
 * được phụ thuộc ngược vào `features/`.
 */
function formatPercent(percent: number, decimals: number): string {
  const factor = 10 ** decimals;
  const rounded = Math.round(percent * factor) / factor;
  return Number.isInteger(rounded) ? `${rounded}%` : `${rounded.toFixed(decimals)}%`;
}

export interface ProgressDonutChartProps {
  /** % tiến độ TỔNG (0-100) — cũng là con số hiện ở tâm vòng. */
  pct: number;
  /**
   * Phần đã HOÀN THÀNH trong `pct` (0-100). Truyền vào → vòng tách **2 màu**:
   * **xanh** = phần hoàn thành · **vàng** = phần đang thực hiện (`pct - donePct`).
   *
   * Bỏ trống → vẽ MỘT cung theo `color` như cũ (dùng cho vòng không có khái niệm
   * "xong hẳn / đang làm", vd cấp nguồn lực).
   */
  donePct?: number;
  /** Token màu (vd 'success-5' | 'warning-5' | 'fg-4'). */
  color: string;
  /**
   * Token ĐẬM hơn 1 bậc, cùng hue (`success-6`…) — chân trong của gradient cung.
   * Bỏ trống thì cung tô phẳng bằng `color`.
   *
   * Nhận qua prop chứ KHÔNG suy từ `color` bằng cách thay hậu tố: mốc 0% dùng
   * `fg-4` mà `fg-6` không tồn tại, ghép chuỗi sẽ ra `var(--color-fg-6)` rỗng và
   * cung mất màu.
   */
  deepColor?: string;
  className?: string;
  /** Class nhãn % ở tâm — mặc định `text-caption-12-bold` (sàn đọc được, §1.5). */
  labelClassName?: string;
  /**
   * Nhãn ở tâm thay cho `pct` (vd `4/10`). Bỏ trống → hiện `pct` đã format.
   * Màu vẫn theo `color` để số ở tâm khớp màu cung đang tô.
   */
  centerLabel?: string;
  /**
   * Số chữ số thập phân của nhãn % ở tâm. Mặc định `1`.
   *
   * Đặt `0` khi vòng này đứng cạnh một bảng đang hiện % NGUYÊN (kit2 `<Progress
   * showValue>` làm tròn nguyên) — hai màn nói về cùng một con số thì phải làm tròn
   * giống nhau, nếu không "8.3%" cạnh "8%" đọc ra như hai số liệu khác nhau.
   */
  labelDecimals?: number;
}

const ProgressDonutChart = memo(
  ({
    pct,
    donePct,
    color,
    deepColor,
    className,
    labelClassName = 'text-caption-12-bold',
    centerLabel,
    labelDecimals = 1,
  }: ProgressDonutChartProps) => {
    const clamped = Math.max(0, Math.min(100, pct));
    const accent = tokenVar(color);
    const deep = tokenVar(deepColor ?? color);
    const uid = useId();
    const fillId = `${uid}-fill`;
    const arcId = `${uid}-arc`;
    const doneId = `${uid}-done`;
    const doingId = `${uid}-doing`;

    /**
     * `donePct` bị kẹp trong `[0, pct]`: hạng mục đếm xong 9/10 (=90%) mà tiến độ gia
     * quyền chỉ 85% thì phần "đang làm" âm — không kẹp là cung vẽ ngược chiều.
     */
    const done = donePct == null ? null : Math.max(0, Math.min(clamped, donePct));

    /** Lát cung, mỗi lát là một khoảng `[from, to]` tính bằng % của cả vòng. */
    const slices =
      done == null
        ? [{ key: 'arc', from: 0, to: clamped, stroke: `url(#${arcId})` }]
        : [
            { key: 'done', from: 0, to: done, stroke: `url(#${doneId})` },
            { key: 'doing', from: done, to: clamped, stroke: `url(#${doingId})` },
          ];

    return (
      /* `@container`: nhãn % ăn theo bề ngang THẬT của chính vòng này — vòng co
         thì chữ tự lùi bậc, không tràn. */
      /*
        ⛔ KHÔNG đặt `size-full` ở đây. `tailwind-merge` KHÔNG coi `w-*`/`h-*` của
        call-site là xung đột với `size-*` (luật chỉ chạy một chiều), nên cả hai
        cùng sống: width + height đều bị chốt 100% và `aspect-square` mất tác dụng
        → vòng thành hình chữ nhật. Cỡ do call-site quyết định.
      */
      <div className={cn('@container/donut relative', className)}>
        {/*
          `viewBox` vuông + `preserveAspectRatio` mặc định (xMidYMid meet) ⇒ vòng tự
          lồng vừa CẠNH NGẮN của ô và luôn tròn, không cần đo bằng JS.
        */}
        <svg className="absolute inset-0 size-full" viewBox="0 0 100 100">
          <defs>
            {/*
              Gradient RADIAL đậm→sáng theo bán kính (chart-conventions §1.3): trên
              nền navy, token `-5` tô nguyên vành dày sẽ loá mép. Đổi bậc, KHÔNG đổi
              hue — mốc 63% đặt đúng mép TRONG của vành.

              `userSpaceOnUse` + `r=50`: giữ NGUYÊN cách quy chiếu cũ (`r="50%"` trên
              ô 100×100). Để mặc định `objectBoundingBox` thì gradient quy theo bbox
              của chính đường tròn đang tô — đổi theo bán kính vành, lệch màu.
            */}
            <radialGradient cx="50" cy="50" gradientUnits="userSpaceOnUse" id={arcId} r="50">
              <stop offset="63%" stopColor={deep} />
              <stop offset="100%" stopColor={accent} />
            </radialGradient>
            {/* 2 màu cố định của chế độ tách lát — KHÔNG ăn theo `color` (màu đó
                đổi theo mức %, mà ý nghĩa "xong" / "đang làm" thì không đổi). */}
            <radialGradient cx="50" cy="50" gradientUnits="userSpaceOnUse" id={doneId} r="50">
              <stop offset="63%" stopColor={tokenVar('success-6')} />
              <stop offset="100%" stopColor={tokenVar('success-5')} />
            </radialGradient>
            <radialGradient cx="50" cy="50" gradientUnits="userSpaceOnUse" id={doingId} r="50">
              <stop offset="63%" stopColor={tokenVar('warning-6')} />
              <stop offset="100%" stopColor={tokenVar('warning-5')} />
            </radialGradient>
          </defs>

          {/* Track — CHROME, cố ý contrast thấp (không mang dữ liệu). Vẽ TRƯỚC. */}
          <circle
            cx="50"
            cy="50"
            fill="none"
            r={RING_RADIUS}
            stroke={tokenVar('divider-1')}
            strokeWidth={RING_WIDTH}
          />

          {/*
            Cung dữ liệu. `rotate(-90)`: đường tròn SVG khởi hành ở 3 giờ, xoay để
            bắt đầu từ ĐỈNH và chạy thuận chiều kim đồng hồ — đúng hướng cũ.
            Chuyển động 650ms chạy bằng CSS `transition` trên `stroke-dasharray`,
            không qua JS nên không có state nào để lệch với DOM.
          */}
          <g transform="rotate(-90 50 50)">
            {slices.map((s) => {
              const span = ((s.to - s.from) / 100) * RING_LENGTH;
              if (span <= 0) return null;
              return (
                <circle
                  key={s.key}
                  cx="50"
                  cy="50"
                  fill="none"
                  r={RING_RADIUS}
                  stroke={s.stroke}
                  strokeDasharray={`${span} ${RING_LENGTH}`}
                  strokeDashoffset={-((s.from / 100) * RING_LENGTH)}
                  // Vòng kín thì bo đầu tự đè lên chính nó — để `butt`.
                  strokeLinecap={clamped >= 100 ? 'butt' : 'round'}
                  strokeWidth={RING_WIDTH}
                  style={{ transition: 'stroke-dasharray 650ms ease-out' }}
                />
              );
            })}
          </g>
        </svg>

        {/*
          VIỀN TRONG — đĩa nền ở tâm, có nét viền tròn mảnh bao quanh chữ %.

          ⛔ Bán kính phải để LỌT HẲN trong lòng vành, KHÔNG được chạm. Vành trong
          nằm ở 37 (viewBox 100). Bản đầu để `w-[70%]` (bán kính 0,35×cạnh) nên đĩa
          TRÙM RA NGOÀI mép trong của vành — mà lớp này vẽ sau nên nó đè lên, ăn mất
          một dải cung và nét viền đọc thành "vòng thứ hai chồng lên vòng %". r=27
          chừa khe hở ~4,5 đơn vị — tách bạch hẳn.

          `vectorEffect` giữ nét đúng 1px thật ở mọi cỡ card.
        */}
        <div className="pointer-events-none absolute inset-0">
          <svg className="size-full" viewBox="0 0 100 100">
            <defs>
              <radialGradient cx="50%" cy="50%" id={fillId} r="50%">
                <stop offset="0%" stopColor={accent} stopOpacity={0.2} />
                <stop offset="70%" stopColor={accent} stopOpacity={0.08} />
                <stop offset="100%" stopColor={accent} stopOpacity={0.03} />
              </radialGradient>
            </defs>
            <circle
              cx="50"
              cy="50"
              fill={`url(#${fillId})`}
              r="27"
              stroke={tokenVarAlpha(color, 0.4)}
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        </div>

        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <span
            className={cn('tabular-nums leading-none', labelClassName)}
            style={{ color: accent }}
          >
            {centerLabel ?? formatPercent(clamped, labelDecimals)}
          </span>
        </div>
      </div>
    );
  },
);

ProgressDonutChart.displayName = 'ProgressDonutChart';

export default ProgressDonutChart;
