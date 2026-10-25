/**
 * Barrel của nhóm `tooltip`.
 *
 * ⛔ KHÔNG export `useTooltipPosition`: đó là phần ruột của `<Tooltip>`, xuất ra
 * là mở đường cho nơi khác tự dựng bong bóng rồi quên mất `<Modal>` — và bong
 * bóng của họ sẽ bị `overflow: hidden` của thẻ cha cắt cụt.
 */
export { Tooltip, type TooltipProps } from './Tooltip';
export { TooltipSheet, type TooltipSheetProps } from './TooltipSheet';

export {
  isHtmlTooltipContent,
  resolveTooltipLevel,
  TOOLTIP_ARROW_HEIGHT,
  TOOLTIP_ARROW_WIDTH,
  TOOLTIP_LEVEL_1_MAX_CHARS,
  TOOLTIP_LEVEL_1_MAX_LINES,
  TOOLTIP_LEVEL_2_MAX_CHARS,
  TOOLTIP_LEVEL_2_MAX_LINES,
  TOOLTIP_LEVEL_3_MIN_LINES,
  TOOLTIP_LEVEL_4_HTML,
  TOOLTIP_MAX_WIDTH,
  TOOLTIP_MIN_WIDTH,
  type TooltipLevel,
} from './tooltip.constants';

export type { TooltipPlacement } from './tooltip-geometry.utils';
