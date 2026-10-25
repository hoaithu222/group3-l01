import type { Rect, Vec2, WhiteboardElement } from './element.types';
import {
  elementBox,
  elementBounds,
  elementCenter,
  elementCorners,
  inflateRect,
  rectCorners,
  rotatePoint,
} from './geometry';
import { distanceToSegment, pointInRect, polygonsIntersect, rectContainsRect } from './intersect';
import { lineEndpoints } from './line';

/** Điểm THẾ GIỚI → khung toạ độ CHƯA xoay của phần tử. Mọi phép thử hình đều làm trong khung này cho đơn giản. */
const toLocal = (el: WhiteboardElement, p: Vec2): Vec2 =>
  rotatePoint(p, elementCenter(el), -el.rotation);

/** Trong ellipse nội tiếp `box` mở rộng `pad` (pad âm = thu nhỏ; thu quá tay thì không còn gì → false). */
function insideEllipse(box: Rect, p: Vec2, pad: number): boolean {
  const a = box.w / 2 + pad;
  const b = box.h / 2 + pad;
  if (a <= 0 || b <= 0) return false;
  const dx = (p.x - (box.x + box.w / 2)) / a;
  const dy = (p.y - (box.y + box.h / 2)) / b;
  return dx * dx + dy * dy <= 1;
}

const insideBox = (box: Rect, p: Vec2, pad: number): boolean => {
  const r = inflateRect(box, pad);
  return r.w >= 0 && r.h >= 0 && pointInRect(p, r);
};

const inside = (el: WhiteboardElement, local: Vec2, pad: number): boolean =>
  el.type === 'ellipse'
    ? insideEllipse(elementBox(el), local, pad)
    : insideBox(elementBox(el), local, pad);

/**
 * `p` có nằm TRONG hình (bỏ qua có tô hay không) — dùng để "dính" đầu mũi tên vào hình (`binding.ts`).
 * Với đường/nét vẽ tự do không có "bên trong" nên chỉ tính khoảng cách tới nét.
 */
export function pointInsideElement(el: WhiteboardElement, p: Vec2, pad = 0): boolean {
  if (el.type === 'line' || el.type === 'arrow' || el.type === 'freehand') {
    return hitTestElement(el, p, pad);
  }
  return inside(el, toLocal(el, p), pad);
}

/**
 * Chạm vào phần tử? `tolerance` tính bằng đơn vị THẾ GIỚI — đổi từ pixel bằng `toWorldTolerance` (chạm ngón tay
 * ~8 px, chia cho zoom; quên chia thì zoom-out xa không chạm nổi nét mảnh).
 *
 *  · rect/ellipse CÓ tô: chạm bên trong. KHÔNG tô: chỉ chạm gần viền (cho phép chọn hình nằm SAU nó).
 *  · `frame`: luôn chỉ viền (nội dung khung phải chọn được xuyên qua).
 *  · text/sticky/image: cả hộp. line/arrow/freehand: gần nét vẽ.
 */
export function hitTestElement(el: WhiteboardElement, p: Vec2, tolerance = 0): boolean {
  const half = el.strokeWidth / 2 + tolerance;
  const local = toLocal(el, p);
  switch (el.type) {
    case 'text':
    case 'sticky':
    case 'image':
      return insideBox(elementBox(el), local, tolerance);
    case 'rect':
    case 'ellipse':
    case 'frame': {
      const filled = el.type !== 'frame' && el.fillColor !== null;
      return filled
        ? inside(el, local, half)
        : inside(el, local, half) && !inside(el, local, -half);
    }
    case 'line':
    case 'arrow':
      return (
        distanceToSegment(local, { x: el.x, y: el.y }, { x: el.x + el.w, y: el.y + el.h }) <= half
      );
    case 'freehand':
      return hitStroke(el, local, half);
  }
}

function hitStroke(el: WhiteboardElement, local: Vec2, half: number): boolean {
  const pts = el.points ?? [];
  if (!pointInRect(local, inflateRect(elementBox(el), half))) return false;
  if (pts.length < 4) {
    return Math.hypot(local.x - el.x - (pts[0] ?? 0), local.y - el.y - (pts[1] ?? 0)) <= half;
  }
  for (let i = 0; i + 3 < pts.length; i += 2) {
    const a = { x: el.x + (pts[i] ?? 0), y: el.y + (pts[i + 1] ?? 0) };
    const b = { x: el.x + (pts[i + 2] ?? 0), y: el.y + (pts[i + 3] ?? 0) };
    if (distanceToSegment(local, a, b) <= half) return true;
  }
  return false;
}

export interface HitOptions {
  tolerance?: number;
  /** Phần tử khoá (`locked`, P1) mặc định KHÔNG chọn được. */
  includeLocked?: boolean;
}

/** Phần tử TRÊN CÙNG dưới điểm chạm. `elements` theo thứ tự z từ dưới lên trên (như `readElements`). */
export function hitTestTopmost(
  elements: readonly WhiteboardElement[],
  p: Vec2,
  { tolerance = 0, includeLocked = false }: HitOptions = {},
): WhiteboardElement | null {
  for (let i = elements.length - 1; i >= 0; i--) {
    const el = elements[i];
    if (!el || (el.locked && !includeLocked)) continue;
    if (hitTestElement(el, p, tolerance)) return el;
  }
  return null;
}

/**
 * Khung chọn nhiều. `intersect`: chạm một phần là chọn (như FigJam); `contain`: phải nằm trọn.
 * ⚠️ `intersect` dùng đa giác hộp xoay của phần tử (đường thì dùng chính đoạn thẳng); nét vẽ tự do dùng hộp bao
 * nên khung có thể "chạm" nét ở chỗ trống trong hộp — chấp nhận, đổi lại rẻ với 5000 phần tử.
 */
export function elementsInRect(
  elements: readonly WhiteboardElement[],
  rect: Rect,
  mode: 'contain' | 'intersect' = 'intersect',
  includeLocked = false,
): WhiteboardElement[] {
  const rectPoly = rectCorners(rect);
  return elements.filter((el) => {
    if (el.locked && !includeLocked) return false;
    if (mode === 'contain') return rectContainsRect(rect, elementBounds(el));
    if (el.type === 'line' || el.type === 'arrow') {
      const { start, end } = lineEndpoints(el);
      return polygonsIntersect([start, end], rectPoly);
    }
    return polygonsIntersect(elementCorners(el), rectPoly);
  });
}
