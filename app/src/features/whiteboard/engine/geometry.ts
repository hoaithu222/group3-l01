import type { Rect, Vec2, WhiteboardElement } from './element.types';

/** Làm tròn 2 chữ số thập phân — số lẻ dài chỉ làm phình bản cập nhật Yjs mà mắt không thấy khác. */
export const round2 = (n: number): number => Math.round(n * 100) / 100;

export const degToRad = (deg: number): number => (deg * Math.PI) / 180;
export const radToDeg = (rad: number): number => (rad * 180) / Math.PI;

/** Đưa góc về [0, 360). `-0` cũng về `0` để `toEqual` không lệch. */
export function normalizeAngle(deg: number): number {
  const m = ((deg % 360) + 360) % 360;
  return m === 0 ? 0 : m;
}

/**
 * Xoay điểm quanh `center`. Trục y hướng XUỐNG (như canvas) nên góc dương = chiều kim đồng hồ trên màn
 * hình, khớp `canvas.rotate(deg)` của Skia — lệch dấu ở đây là hit-test trúng hình bị xoay ngược.
 */
export function rotatePoint(p: Vec2, center: Vec2, deg: number): Vec2 {
  if (deg === 0) return { x: p.x, y: p.y };
  const rad = degToRad(deg);
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = p.x - center.x;
  const dy = p.y - center.y;
  return { x: center.x + dx * cos - dy * sin, y: center.y + dx * sin + dy * cos };
}

/** `w`,`h` âm (đường chéo ngược) → hộp thường với `w`,`h` >= 0. */
export function normalizeRect(r: Rect): Rect {
  return {
    x: r.w < 0 ? r.x + r.w : r.x,
    y: r.h < 0 ? r.y + r.h : r.y,
    w: Math.abs(r.w),
    h: Math.abs(r.h),
  };
}

export const rectCenter = (r: Rect): Vec2 => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

/** Hộp CHƯA xoay của phần tử, đã chuẩn hoá. */
export const elementBox = (el: Pick<WhiteboardElement, 'x' | 'y' | 'w' | 'h'>): Rect =>
  normalizeRect({ x: el.x, y: el.y, w: el.w, h: el.h });

export const elementCenter = (el: Pick<WhiteboardElement, 'x' | 'y' | 'w' | 'h'>): Vec2 =>
  rectCenter(elementBox(el));

/** Bốn góc (trái-trên, phải-trên, phải-dưới, trái-dưới) SAU khi xoay. */
export function rectCorners(box: Rect, rotation = 0): Vec2[] {
  const c = rectCenter(box);
  return [
    { x: box.x, y: box.y },
    { x: box.x + box.w, y: box.y },
    { x: box.x + box.w, y: box.y + box.h },
    { x: box.x, y: box.y + box.h },
  ].map((p) => rotatePoint(p, c, rotation));
}

export const elementCorners = (el: WhiteboardElement): Vec2[] =>
  rectCorners(elementBox(el), el.rotation);

export function aabbOf(points: readonly Vec2[]): Rect {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  if (minX === Infinity) return { x: 0, y: 0, w: 0, h: 0 };
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/** Hộp bao trục-song-song của phần tử SAU khi xoay (chưa cộng nét vẽ). */
export const elementBounds = (el: WhiteboardElement): Rect => aabbOf(elementCorners(el));

export function unionRects(rects: readonly Rect[]): Rect | null {
  if (rects.length === 0) return null;
  return aabbOf(
    rects.flatMap((r) => [
      { x: r.x, y: r.y },
      { x: r.x + r.w, y: r.y + r.h },
    ]),
  );
}

export const inflateRect = (r: Rect, pad: number): Rect => ({
  x: r.x - pad,
  y: r.y - pad,
  w: r.w + 2 * pad,
  h: r.h + 2 * pad,
});
