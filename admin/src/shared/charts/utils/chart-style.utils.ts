/**
 * Sinh style object của trục / chú giải / tooltip / nhãn cột theo bậc mật độ.
 *
 * Trước đây các style này là hằng số `fontSize: 10` nên phóng to toàn màn hình
 * chữ vẫn y nguyên. Giờ chúng là hàm của `ChartDensity` — widget đo chính mình
 * (`useChartMetrics`) rồi lấy đúng bậc.
 */
import type { CSSProperties } from 'react';

import {
  CHART_DENSITY_BREAKPOINTS,
  CHART_DENSITY_SCALE,
  type ChartDensity,
  type ChartDensityScale,
} from '../constants/chart-density.constants';
import { CHART_CHROME, CHART_CHROME_TV } from '../constants/chart-palette.constants';
import { tokenVar } from './chart-tokens';

/**
 * Chọn bậc mật độ theo chiều cao thực (px) của vùng vẽ.
 *
 * Truyền thẳng chiều cao đo được — KHÔNG chia cho `uiScale`. TV mode chỉ nhân
 * cỡ chữ, khung chart giữ nguyên kích thước, nên chiều cao đo được đã là px
 * logic. (Bản trước có phép chia để bù cho việc khung phình theo root font-size;
 * cơ chế đó đã bỏ vì làm vỡ bố cục.)
 */
export function chartDensityFor(height: number): ChartDensity {
  if (height >= CHART_DENSITY_BREAKPOINTS.xlarge) return 'xlarge';
  if (height >= CHART_DENSITY_BREAKPOINTS.large) return 'large';
  if (height >= CHART_DENSITY_BREAKPOINTS.base) return 'base';
  return 'compact';
}

/** Thứ tự bậc mật độ từ nhỏ tới lớn — dùng để so sánh / chặn trần. */
const CHART_DENSITY_ORDER: readonly ChartDensity[] = ['compact', 'base', 'large', 'xlarge'];

/**
 * Chặn TRẦN bậc mật độ: bậc đo được vượt `max` thì hạ về `max`, không thì giữ nguyên.
 * `max` vắng ⇒ không chặn (hành vi gốc).
 */
export function capChartDensity(density: ChartDensity, max?: ChartDensity): ChartDensity {
  if (!max) return density;
  return CHART_DENSITY_ORDER.indexOf(density) > CHART_DENSITY_ORDER.indexOf(max) ? max : density;
}

/**
 * Nhân cỡ chữ theo `uiScale`.
 *
 * Làm tròn NGUYÊN: `fontSize` là thuộc tính SVG, giá trị lẻ không giúp gì mà chỉ
 * làm nét chữ mờ đi khi trình duyệt nội suy.
 *
 * KHÔNG có sàn tối thiểu — khung chart không giãn ở TV nên ép sàn sẽ làm nhãn
 * trục đè nhau (xem chú thích ở `chart-density.constants.ts`).
 */
function scaleFont(value: number, uiScale: number): number {
  return Math.round(value * uiScale);
}

/**
 * Nhân bề dày NÉT THẲNG — bắt buộc ra SỐ NGUYÊN ≥ 1.
 *
 * Nét dày lẻ không trùng lưới pixel thiết bị nên bị khử răng cưa: một đường đáng
 * lẽ sắc bị trải thành vệt xám. Xem giải thích đầy đủ ở
 * `chart-density.constants.ts` §"Mọi bề dày NÉT MẢNH phải là SỐ NGUYÊN".
 */
function scaleStroke(value: number, uiScale: number): number {
  return Math.max(1, Math.round(value * uiScale));
}

export interface ChartStyles {
  scale: ChartDensityScale;
  /** `tick` của XAxis/YAxis. */
  axisTick: { fill: string; fontSize: number; fontWeight: number };
  /** `axisLine` của trục hiển thị. */
  axisLine: { stroke: string; strokeWidth: number };
  /** Props của `<CartesianGrid>`. */
  grid: { stroke: string; strokeWidth: number; strokeDasharray: string };
  /** `wrapperStyle` của `<Legend>`. */
  legend: CSSProperties;
  /** `contentStyle` của `<Tooltip>`. */
  tooltip: CSSProperties;
  /** `itemStyle` của `<Tooltip>`. */
  tooltipItem: CSSProperties;
  /** `labelStyle` của `<Tooltip>`. */
  tooltipLabel: CSSProperties;
  /** Style chữ cho `<LabelList>` trên đỉnh cột. */
  barLabel: {
    fontSize: number;
    fontWeight: number;
    letterSpacing: string;
  };
}

/**
 * Nhãn số trên đỉnh cột KHÔNG dùng `stroke` + `paintOrder`.
 *
 * `chart-conventions.md` từng yêu cầu viền `bg-base` 3px để tách chữ khỏi nền.
 * Thực tế trên nền tối, viền đó vẽ ra một quầng ĐEN quanh mỗi con số, trông như
 * bóng chữ bẩn và làm chữ nhoè. Nhãn đặt `position="top"` vốn nằm NGOÀI thân
 * cột, trên nền panel sạch → không cần tách nền.
 *
 * Bù lại độ đọc bằng `tabular-nums` (cột số thẳng hàng) + weight 600.
 *
 * ⚠️ KHÔNG đặt `fontFamily`: nhãn số dùng ĐÚNG font sans của app, kế thừa từ
 * `<body>`. Bản trước ép JetBrains Mono cho mọi con số — chữ số mono nằm cạnh
 * nhãn sans của cùng một biểu đồ đọc ra như hai hệ chữ ghép vào nhau, và ở cỡ
 * 11–13px thì mono còn nhoè hơn sans. Căn cột số là việc của `tabular-nums`,
 * không cần tới font mono.
 */
const BAR_LABEL_WEIGHT = 600;
const BAR_LABEL_WEIGHT_TV = 700;

/**
 * @param density  Bậc mật độ, chọn bằng `chartDensityFor(size.height)`.
 * @param uiScale  Hệ số TV mode. **Phải là scale HIỆU LỰC** — dùng
 *                 `selectEffectiveUiScale` từ `@/app/store`, KHÔNG đọc thẳng
 *                 `state.uiScale`: store vẫn nhớ hệ số TV khi đang ở chế độ
 *                 standard, đọc thẳng sẽ phóng to chart cả khi TV đang tắt.
 */
export function buildChartStyles(density: ChartDensity, uiScale = 1): ChartStyles {
  const base = CHART_DENSITY_SCALE[density];
  const isTv = uiScale > 1;
  const chromeTokens = isTv ? CHART_CHROME_TV : CHART_CHROME;
  const chrome = tokenVar(chromeTokens.grid);

  // Nhân TOÀN BỘ bậc một lần ở đây rồi mới dựng style, để `m.scale.*` mà
  // component đọc trực tiếp (yAxisWidth, lineWidth, dotRadius…) cũng đã scale —
  // nếu chỉ scale trong style object thì chart sẽ có chữ to mà trục vẫn hẹp.
  const scale: ChartDensityScale = isTv
    ? {
        axis: scaleFont(base.axis, uiScale),
        legend: scaleFont(base.legend, uiScale),
        tooltipTitle: scaleFont(base.tooltipTitle, uiScale),
        tooltipItem: scaleFont(base.tooltipItem, uiScale),
        barLabel: scaleFont(base.barLabel, uiScale),
        pieLabel: scaleFont(base.pieLabel, uiScale),
        lineWidth: scaleStroke(base.lineWidth, uiScale),
        // Bán kính hình tròn — KHÔNG có mép thẳng nên được phép lẻ.
        dotRadius: base.dotRadius * uiScale,
        activeDotRadius: base.activeDotRadius * uiScale,
        gridWidth: scaleStroke(base.gridWidth, uiScale),
        yAxisWidth: Math.round(base.yAxisWidth * uiScale),
        leaderWidth: scaleStroke(base.leaderWidth, uiScale),
      }
    : base;

  return {
    scale,

    axisTick: {
      fill: tokenVar(chromeTokens.axisLabel),
      fontSize: scale.axis,
      // Nhãn trục ở TV cần đậm hơn: nét 500 ở xa bị chìm vào nền có gradient.
      fontWeight: isTv ? 600 : 500,
    },

    axisLine: { stroke: chrome, strokeWidth: scale.gridWidth },

    grid: { stroke: chrome, strokeWidth: scale.gridWidth, strokeDasharray: '3 3' },

    legend: {
      fontSize: scale.legend,
      color: tokenVar(isTv ? 'fg-1' : 'fg-3'),
      paddingTop: 4,
    },

    tooltip: {
      background: tokenVar('bg-popup'),
      border: `1px solid ${tokenVar('border-2')}`,
      borderRadius: 0,
      padding: '8px 10px',
      color: tokenVar('fg-1'),
      fontSize: scale.tooltipTitle,
      boxShadow: '0 8px 24px rgba(0,0,0,0.38)',
      // ⚠️ KHÔNG `backdropFilter` ở đây. Recharts định vị wrapper tooltip bằng
      // `transform: translate(x,y)` bám con trỏ nên toạ độ luôn lẻ; thêm
      // backdrop-filter là ép nó thành composited layer → toàn bộ chữ trong
      // tooltip bị nội suy lại. Mà tooltip đúng là nơi DUY NHẤT đọc được số
      // thập phân đầy đủ và tên nhà thầu đầy đủ — nó tồn tại đúng lúc người
      // dùng đang cố đọc chính xác. Nền `bg-popup` vốn đã 96% đục nên blur
      // cũng chẳng còn gì phía sau để làm mờ.
    },

    tooltipItem: {
      color: tokenVar('fg-2'),
      fontSize: scale.tooltipItem,
      padding: '2px 0',
    },

    tooltipLabel: {
      color: tokenVar('fg-3'),
      fontSize: scale.tooltipItem,
      marginBottom: 4,
      fontWeight: 600,
    },

    barLabel: {
      fontSize: scale.barLabel,
      // 700 ở TV: nhãn số nằm trên nền panel có gradient, weight 600 ở xa mất nét.
      fontWeight: isTv ? BAR_LABEL_WEIGHT_TV : BAR_LABEL_WEIGHT,
      letterSpacing: '-0.01em',
    },
  };
}
