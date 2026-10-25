/**
 * useChartMetrics — đo vùng vẽ của chart rồi trả về bộ style đúng bậc mật độ.
 *
 * Đây là mắt xích làm cho "phóng to = đọc rõ hơn": cùng một component, khi nằm
 * trong slot bẹt thì lấy bậc `compact`, khi bấm xem toàn màn hình thì vùng vẽ
 * cao lên và component tự nhảy sang bậc `large`/`xlarge` — chữ, nét, chấm, bề
 * rộng trục đều to theo.
 *
 * Usage:
 *   const uiScale = useDisplayStore(selectEffectiveUiScale);   // ← tầng app
 *   const [boxRef, m] = useChartMetrics<HTMLDivElement>(uiScale);
 *   <div ref={boxRef} className="h-full w-full">
 *     <ResponsiveContainer …>
 *       <XAxis tick={m.axisTick} axisLine={m.axisLine} />
 *       <YAxis width={m.scale.yAxisWidth} tick={m.axisTick} />
 *     </ResponsiveContainer>
 *   </div>
 *
 * Bọc `useElementSize` của `@/shared/hooks` (callback ref + đo đồng bộ trước
 * paint) nên KHÔNG có frame nào vẽ bằng kích thước fallback.
 */
import { useMemo } from 'react';

import { useElementSize } from '@/shared/hooks';

import { CHART_DENSITY_FALLBACK } from '../constants/chart-density.constants';
import type { ChartDensity } from '../constants/chart-density.constants';
import {
  buildChartStyles,
  capChartDensity,
  chartDensityFor,
  type ChartStyles,
} from '../utils/chart-style.utils';

export interface ChartMetrics extends ChartStyles {
  density: ChartDensity;
  /** Bề rộng ĐO ĐƯỢC (px thật, đã gồm `uiScale`). */
  width: number;
  /** Chiều cao ĐO ĐƯỢC (px thật, đã gồm `uiScale`). */
  height: number;
  /** Hệ số TV đang có hiệu lực — `1` ở chế độ standard. */
  uiScale: number;
}

/**
 * @param uiScale Hệ số phóng chữ ĐANG CÓ HIỆU LỰC (1 ở chế độ thường).
 *
 * ⛔ Truyền vào chứ KHÔNG đọc `@/app/store` trong này: `shared/` biết tới `app/`
 * là kéo cả cây store vào mọi chart, mọi test, mọi showcase. Tầng `app/` đọc
 * store rồi truyền xuống — cùng lối với `ThemeToggle` và `useTvEscapeHatch`:
 *
 *   const uiScale = useDisplayStore(selectEffectiveUiScale);
 *   const [boxRef, m] = useChartMetrics<HTMLDivElement>(uiScale);
 *
 * ⚠️ Dùng `selectEffectiveUiScale`, KHÔNG phải `s.uiScale`: store vẫn NHỚ hệ số
 * TV trong lúc đang ở chế độ thường, đọc thẳng sẽ phóng chart cả khi TV đã tắt.
 *
 * @param maxDensity Trần bậc mật độ (tuỳ chọn). Dùng cho chart HERO lấp trọn trang
 * (vd biểu đồ trang Tổng quan): nó cao vì BỐ CỤC, không phải vì người dùng bấm phóng
 * to, nên không nên nhảy lên `xlarge` (trục 16px, nét 4px — bậc dành cho toàn màn
 * hình / TV). Không truyền ⇒ hành vi gốc.
 */
export function useChartMetrics<T extends HTMLElement>(uiScale = 1, maxDensity?: ChartDensity) {
  const [ref, size] = useElementSize<T>();

  const metrics = useMemo<ChartMetrics>(() => {
    // Bậc mật độ chọn theo chiều cao ĐO ĐƯỢC, KHÔNG chia cho `uiScale`.
    //
    // Bản trước có `size.height / uiScale` để chống scale kép — đúng cho phương
    // án cũ, khi `--ui-scale` nhân vào root font-size nên khung chart cũng phình
    // theo. Phương án đó đã bỏ (làm vỡ bố cục): nay TV chỉ nhân CỠ CHỮ, khung
    // giữ nguyên kích thước. Giữ phép chia lại thì slot 220px ở TV bị tính thành
    // 200px → tụt bậc `base` xuống `compact`, chữ NHỎ ĐI đúng lúc cần to lên.
    const measured = size.height > 0 ? chartDensityFor(size.height) : CHART_DENSITY_FALLBACK;
    const density = capChartDensity(measured, maxDensity);
    return {
      ...buildChartStyles(density, uiScale),
      density,
      width: size.width,
      height: size.height,
      uiScale,
    };
  }, [size.height, size.width, uiScale, maxDensity]);

  return [ref, metrics] as const;
}

export default useChartMetrics;
