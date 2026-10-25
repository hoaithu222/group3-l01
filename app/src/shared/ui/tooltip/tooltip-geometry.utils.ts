import {
  TOOLTIP_ARROW_HEIGHT,
  TOOLTIP_ARROW_SIZE,
  TOOLTIP_ARROW_WIDTH,
  TOOLTIP_RADIUS,
} from './tooltip.constants';

/**
 * Phần số học của việc đặt bong bóng tooltip — hàm thuần, không đụng React.
 *
 * Tách khỏi `useTooltipPosition` vì đây là chỗ dễ sai nhất và cũng là chỗ duy
 * nhất kiểm được bằng test mà không phải dựng cây component.
 */

export type TooltipPlacement = 'bottom' | 'left' | 'right' | 'top';

export interface TooltipAnchor {
  height: number;
  width: number;
  x: number;
  y: number;
}

export interface TooltipGeometry {
  /** Toạ độ góc trái-trên của hình vuông xoay 45° làm mũi nhọn. */
  arrowLeft: number;
  arrowTop: number;
  left: number;
  /** Hướng THỰC TẾ sau khi đã lật vì tràn mép — có thể khác hướng yêu cầu. */
  placement: TooltipPlacement;
  top: number;
}

/** Vùng được phép vẽ, tính theo toạ độ màn hình (đã trừ tai thỏ và mép an toàn). */
export interface TooltipArea {
  bottom: number;
  left: number;
  right: number;
  top: number;
}

/** ⚠️ `max` có thể nhỏ hơn `min` trên máy thấp/màn chia đôi — chặn kẹp ngược. */
function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

/**
 * Hai việc: LẬT hướng khi phía yêu cầu không đủ chỗ, và KẸP toạ độ vào vùng an
 * toàn. Mũi nhọn được kẹp riêng, cách góc ít nhất một bán kính bo — không kẹp
 * thì với phần tử kích hoạt sát mép màn, mũi nhọn leo lên phần bo góc và trông
 * như một cục lồi rời khỏi bong bóng.
 *
 * ⚠️ Lật chỉ khi phía kia THẬT SỰ đủ chỗ. Lật mù quáng thì trên máy màn nhỏ
 * bong bóng nhảy qua nhảy lại giữa hai phía đều chật, và cuối cùng vẫn bị kẹp.
 */
export function resolveTooltipGeometry(
  anchor: TooltipAnchor,
  bubble: { height: number; width: number },
  area: TooltipArea,
  placement: TooltipPlacement,
): TooltipGeometry {
  const centerX = anchor.x + anchor.width / 2;
  const centerY = anchor.y + anchor.height / 2;
  const half = TOOLTIP_ARROW_SIZE / 2;

  if (placement === 'top' || placement === 'bottom') {
    const above = anchor.y - bubble.height - TOOLTIP_ARROW_HEIGHT;
    const below = anchor.y + anchor.height + TOOLTIP_ARROW_HEIGHT;
    const fitsAbove = above >= area.top;
    const fitsBelow = below + bubble.height <= area.bottom;
    const final: TooltipPlacement =
      placement === 'top'
        ? fitsAbove || !fitsBelow
          ? 'top'
          : 'bottom'
        : fitsBelow || !fitsAbove
          ? 'bottom'
          : 'top';

    const top = clamp(final === 'top' ? above : below, area.top, area.bottom - bubble.height);
    const left = clamp(centerX - bubble.width / 2, area.left, area.right - bubble.width);
    const arrowCenter = clamp(
      centerX,
      left + TOOLTIP_RADIUS + TOOLTIP_ARROW_WIDTH / 2,
      left + bubble.width - TOOLTIP_RADIUS - TOOLTIP_ARROW_WIDTH / 2,
    );

    return {
      arrowLeft: arrowCenter - half,
      arrowTop: (final === 'top' ? top + bubble.height : top) - half,
      left,
      placement: final,
      top,
    };
  }

  const before = anchor.x - bubble.width - TOOLTIP_ARROW_HEIGHT;
  const after = anchor.x + anchor.width + TOOLTIP_ARROW_HEIGHT;
  const fitsBefore = before >= area.left;
  const fitsAfter = after + bubble.width <= area.right;
  const final: TooltipPlacement =
    placement === 'left'
      ? fitsBefore || !fitsAfter
        ? 'left'
        : 'right'
      : fitsAfter || !fitsBefore
        ? 'right'
        : 'left';

  const left = clamp(final === 'left' ? before : after, area.left, area.right - bubble.width);
  const top = clamp(centerY - bubble.height / 2, area.top, area.bottom - bubble.height);
  const arrowCenter = clamp(
    centerY,
    top + TOOLTIP_RADIUS + TOOLTIP_ARROW_WIDTH / 2,
    top + bubble.height - TOOLTIP_RADIUS - TOOLTIP_ARROW_WIDTH / 2,
  );

  return {
    arrowLeft: (final === 'left' ? left + bubble.width : left) - half,
    arrowTop: arrowCenter - half,
    left,
    placement: final,
    top,
  };
}
