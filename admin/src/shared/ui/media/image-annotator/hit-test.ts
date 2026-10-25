/**
 * Hit-test thuần cho editor chú thích ảnh — không React, không DOM ngoài `ctx`.
 * Mọi toạ độ / tolerance đều ở hệ pixel ảnh gốc (xem `annotation.types.ts`).
 */
import type { Bounds, EllipseShape, Point, Shape } from './annotation.types';
import { cornerHandles, moveHandleRect, shapeBounds, type HandleKey } from './draw-shapes';

/** Ellipse (cx, cy, rx, ry) suy ra từ 2 điểm — dùng cả khi vẽ mới lẫn khi kéo handle đổi cỡ. */
export const ellipseFromDrag = (
  a: Point,
  b: Point,
): Pick<EllipseShape, 'cx' | 'cy' | 'rx' | 'ry'> => ({
  cx: (a.x + b.x) / 2,
  cy: (a.y + b.y) / 2,
  rx: Math.abs(b.x - a.x) / 2,
  ry: Math.abs(b.y - a.y) / 2,
});

const pointInBounds = (pt: Point, b: Bounds, tol: number): boolean =>
  pt.x >= b.x - tol &&
  pt.x <= b.x + b.width + tol &&
  pt.y >= b.y - tol &&
  pt.y <= b.y + b.height + tol;

/**
 * Shape TRÊN CÙNG dưới con trỏ (phần tử sau trong mảng nằm trên → duyệt ngược).
 * Dùng hộp bao mở rộng `tol` — đủ cho quyết định "bấm trúng object nào" ở tool text/select.
 */
export const hitTest = (
  ctx: CanvasRenderingContext2D,
  shapes: Shape[],
  pt: Point,
  tol: number,
): Shape | undefined => {
  for (let i = shapes.length - 1; i >= 0; i -= 1) {
    const shape = shapes[i];
    if (pointInBounds(pt, shapeBounds(ctx, shape), tol)) return shape;
  }
  return undefined;
};

/** Handle góc của shape đang chọn ở dưới con trỏ, hoặc null. `tol` = bán kính bấm trúng (px ảnh). */
export const handleAt = (
  ctx: CanvasRenderingContext2D,
  selected: Shape | null,
  pt: Point,
  tol: number,
): HandleKey | null => {
  if (!selected) return null;
  const handles = cornerHandles(shapeBounds(ctx, selected));
  for (const h of handles) {
    if (Math.abs(pt.x - h.x) <= tol && Math.abs(pt.y - h.y) <= tol) return h.key;
  }
  return null;
};

/** Shape có thẻ kéo (move tag) dưới con trỏ — thứ tự ngược để trả về shape ở trên cùng. */
export const moveHandleAt = (
  ctx: CanvasRenderingContext2D,
  shapes: Shape[],
  pt: Point,
  scale: number,
  imageHeight: number,
): Shape | undefined => {
  for (let i = shapes.length - 1; i >= 0; i -= 1) {
    const shape = shapes[i];
    const rect = moveHandleRect(shapeBounds(ctx, shape), scale, imageHeight);
    if (pointInBounds(pt, rect, 0)) return shape;
  }
  return undefined;
};
