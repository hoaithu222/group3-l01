import { MIN_SIZE } from './element.constants';
import type { PatchMap, Rect, Vec2, WhiteboardElement } from './element.types';
import {
  elementBounds,
  elementCenter,
  normalizeAngle,
  radToDeg,
  rotatePoint,
  round2,
  unionRects,
} from './geometry';
import { HANDLE_DIRS, type ResizeHandleId } from './handles';
import { scalePoints, type ResizeOptions } from './manipulate';

/** Khung chọn của nhiều phần tử = hộp bao trục-song-song của các hộp đã xoay. `null` khi rỗng. */
export const selectionBox = (elements: readonly WhiteboardElement[]): Rect | null =>
  unionRects(elements.map(elementBounds));

/** Góc (độ) quay từ hướng `from` sang hướng `to` quanh `center` — cho cử chỉ xoay nhóm. */
export const rotationDelta = (center: Vec2, from: Vec2, to: Vec2): number =>
  radToDeg(
    Math.atan2(to.y - center.y, to.x - center.x) - Math.atan2(from.y - center.y, from.x - center.x),
  );

/**
 * Xoay cả nhóm quanh `center` một góc `deltaDeg`: tâm từng phần tử quay quanh `center` và `rotation` cộng thêm
 * đúng góc đó — phép quay cứng nên chính xác cho mọi loại phần tử (kể cả đường có `w`,`h` âm).
 */
export function rotateElements(
  elements: readonly WhiteboardElement[],
  center: Vec2,
  deltaDeg: number,
): PatchMap {
  const patches: PatchMap = new Map();
  for (const el of elements) {
    if (el.locked) continue;
    const c = rotatePoint(elementCenter(el), center, deltaDeg);
    patches.set(el.id, {
      x: round2(c.x - el.w / 2),
      y: round2(c.y - el.h / 2),
      rotation: normalizeAngle(round2(el.rotation + deltaDeg)),
    });
  }
  return patches;
}

/**
 * Co giãn cả nhóm theo tay nắm của `box` (khung chọn, KHÔNG xoay). Tâm và kích thước từng phần tử nhân theo tỉ lệ
 * quanh điểm neo đối diện; `rotation` từng phần tử giữ nguyên.
 * ⚠️ Chính xác khi tỉ lệ đều (giữ tỉ lệ) hoặc phần tử chưa xoay; kéo lệch tỉ lệ với phần tử đang xoay chỉ là xấp
 * xỉ (hình xoay không thể co giãn không đều mà vẫn là hình chữ nhật) — FigJam cũng làm vậy.
 */
export function resizeGroup(
  elements: readonly WhiteboardElement[],
  box: Rect,
  handle: ResizeHandleId,
  pointer: Vec2,
  { keepAspect = false, minSize = MIN_SIZE }: ResizeOptions = {},
): PatchMap {
  const dir = HANDLE_DIRS[handle];
  const anchor = {
    x: box.x + box.w / 2 - (dir.x * box.w) / 2,
    y: box.y + box.h / 2 - (dir.y * box.h) / 2,
  };
  let w = dir.x === 0 ? box.w : Math.max(minSize, dir.x * (pointer.x - anchor.x));
  let h = dir.y === 0 ? box.h : Math.max(minSize, dir.y * (pointer.y - anchor.y));
  if (keepAspect && dir.x !== 0 && dir.y !== 0 && box.w > 0 && box.h > 0) {
    const s = Math.max(w / box.w, h / box.h);
    w = box.w * s;
    h = box.h * s;
  }
  const sx = box.w > 0 ? w / box.w : 1;
  const sy = box.h > 0 ? h / box.h : 1;
  const patches: PatchMap = new Map();
  for (const el of elements) {
    if (el.locked) continue;
    const c = elementCenter(el);
    const cx = anchor.x + (c.x - anchor.x) * sx;
    const cy = anchor.y + (c.y - anchor.y) * sy;
    const nw = el.w * sx;
    const nh = el.h * sy;
    patches.set(el.id, {
      x: round2(cx - nw / 2),
      y: round2(cy - nh / 2),
      w: round2(nw),
      h: round2(nh),
      ...(el.type === 'freehand' && el.points ? { points: scalePoints(el.points, sx, sy) } : {}),
    });
  }
  return patches;
}
