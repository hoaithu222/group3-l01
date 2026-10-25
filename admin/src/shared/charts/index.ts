/**
 * `@/shared/charts` — hạ tầng chart dùng chung (Recharts).
 *
 * NGUỒN DUY NHẤT cho: bậc mật độ, bảng màu, style trục/lưới/tooltip/legend,
 * helper token màu, và hệ số phóng to TV mode.
 *
 * Trước đây bộ này nằm trong `dashboard-project/shared/` và đã bị fork ra 6 bản
 * ở các feature khác, mỗi bản đông cứng ở `fontSize: 10`. Các fork đó chính là
 * ẢNH CHỤP CỦA MỘT BUG ĐÃ ĐƯỢC SỬA Ở NƠI KHÁC: chữ chart không đổi cỡ khi phóng
 * to. Gom về đây để sửa một lần là mọi chart cùng hưởng.
 *
 * ⚠️ Hai bản fork trong `org-hub/` (`big-screen`, `dashboard`) **cố ý giữ nguyên**
 * — hai module đó nằm ngoài phạm vi TV mode (chốt 2026-08-07). Chúng tự chứa,
 * không import gì từ đây, nên không vỡ. Không phải sót.
 *
 * Dùng:
 * ```tsx
 * const uiScale = useDisplayStore(selectEffectiveUiScale);   // ← tầng app truyền xuống
 * const [boxRef, m] = useChartMetrics<HTMLDivElement>(uiScale);
 * <div ref={boxRef} className="h-full w-full">
 *   <ResponsiveContainer width="100%" height="100%">
 *     <BarChart …>
 *       <CartesianGrid {...m.grid} vertical={false} />
 *       <XAxis tick={m.axisTick} axisLine={m.axisLine} />
 *       <YAxis width={m.scale.yAxisWidth} tick={m.axisTick} />
 *     </BarChart>
 *   </ResponsiveContainer>
 * </div>
 * ```
 * ⛔ KHÔNG viết `fontSize` bằng số trong file chart — mọi cỡ chữ qua `m.scale.*`.
 */

// ── Bậc mật độ ────────────────────────────────────────────────
export {
  CHART_DENSITY_BREAKPOINTS,
  CHART_DENSITY_FALLBACK,
  CHART_DENSITY_SCALE,
} from './constants/chart-density.constants';
export type { ChartDensity, ChartDensityScale } from './constants/chart-density.constants';

// ── Bảng màu ──────────────────────────────────────────────────
export * from './constants/chart-palette.constants';

// ── Helper token màu + định dạng số ───────────────────────────
export {
  areaGradientPair,
  barSizeByCount,
  fmt3,
  labelInt,
  progressToneToken,
  seriesTokenAt,
  tokenAtStep,
  tokenVar,
  tokenVarAlpha,
  tokenVarOver,
} from './utils/chart-tokens';

// ── Style theo bậc ────────────────────────────────────────────
export { buildChartStyles, chartDensityFor } from './utils/chart-style.utils';
export type { ChartStyles } from './utils/chart-style.utils';

// ── Trục ──────────────────────────────────────────────────────
export * from './utils/chart-axis.utils';

// ── Nhãn % trên cung donut ────────────────────────────────────
export {
  ARC_LABEL_FILL,
  ARC_LABEL_MAX,
  ARC_LABEL_STYLE,
  arcLabelFits,
  arcLabelFontSize,
  arcLabelPoint,
} from './utils/chart-arc-label.utils';
export type { ArcLabelPoint } from './utils/chart-arc-label.utils';

// ── Cụm nhãn ở TÂM donut/gauge ────────────────────────────────
export {
  PERCENT_LABEL_CHARS,
  centerCaptionFits,
  centerLabelFont,
  centerLabelMaxWidth,
} from './utils/chart-center-label.utils';
export type { CenterLabelFitOptions, CenterLabelFont } from './utils/chart-center-label.utils';

// ── Hook đo ───────────────────────────────────────────────────
export { useChartMetrics } from './hooks/useChartMetrics';
export type { ChartMetrics } from './hooks/useChartMetrics';
