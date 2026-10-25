import { MIN_SIZE } from './element.constants';
import type { ElementPatch, PatchMap, Vec2, WhiteboardElement } from './element.types';
import {
  elementBox,
  elementCenter,
  normalizeAngle,
  radToDeg,
  rectCenter,
  rotatePoint,
  round2,
} from './geometry';
import { HANDLE_DIRS, type ResizeHandleId } from './handles';
import { endpointsToFields, lineEndpoints } from './line';

/**
 * Các hàm ở đây THUẦN: nhận trạng thái hiện tại + con trỏ, trả BẢN VÁ (`ElementPatch`) — không chạm Y.Doc.
 * Cử chỉ kéo chỉ gọi chúng để vẽ bản nháp; NHẢ TAY mới gom bản vá và ghi MỘT transaction (README §2: không phát
 * mỗi frame vào CRDT). Sau khi vá hình có mũi tên dính vào, chạy `withArrowRebinding` (binding.ts).
 */

/**
 * Dời các phần tử. Mũi tên dính vào hình KHÔNG được dời cùng thì bị gỡ dính (kéo mũi tên một mình nghĩa là
 * người dùng muốn rời khỏi hình đó — nếu giữ dính, lần vá kế sẽ kéo đầu mũi tên nhảy ngược về hình cũ).
 * Phần tử khoá (`locked`) không dời.
 */
export function moveElements(
  elements: readonly WhiteboardElement[],
  dx: number,
  dy: number,
): PatchMap {
  const moving = new Set(elements.map((el) => el.id));
  const patches: PatchMap = new Map();
  for (const el of elements) {
    if (el.locked) continue;
    const patch: ElementPatch = { x: round2(el.x + dx), y: round2(el.y + dy) };
    if (el.startBinding && !moving.has(el.startBinding.elementId)) patch.startBinding = undefined;
    if (el.endBinding && !moving.has(el.endBinding.elementId)) patch.endBinding = undefined;
    patches.set(el.id, patch);
  }
  return patches;
}

export interface ResizeOptions {
  /** Giữ tỉ lệ (chỉ có nghĩa với tay nắm GÓC). */
  keepAspect?: boolean;
  minSize?: number;
}

/** Nhân toạ độ điểm (mảng phẳng, tương đối) theo tỉ lệ — khi đổi cỡ nét vẽ tay. */
export function scalePoints(points: readonly number[], sx: number, sy: number): number[] {
  return points.map((v, i) => round2(v * (i % 2 === 0 ? sx : sy)));
}

/**
 * Kéo tay nắm `handle` của MỘT phần tử (kể cả đang xoay) tới `pointer` (toạ độ thế giới).
 * Cách làm: điểm NEO (phía đối diện tay nắm) đứng yên trong thế giới; đo con trỏ trong khung đã xoay của phần tử
 * để có kích thước mới; tâm mới nằm giữa neo và tay nắm. Làm trực tiếp trên toạ độ chưa xoay thì hình xoay 30°
 * bị kéo lệch khỏi con trỏ.
 * `line`/`arrow` trả `{}`: chúng đổi kích thước bằng KÉO ĐẦU MÚT (`moveLineEndpoint`), hộp có dấu âm không hợp
 * với luật "neo đối diện".
 */
export function resizeBox(
  el: WhiteboardElement,
  handle: ResizeHandleId,
  pointer: Vec2,
  { keepAspect = false, minSize = MIN_SIZE }: ResizeOptions = {},
): ElementPatch {
  if (el.type === 'line' || el.type === 'arrow') return {};
  const dir = HANDLE_DIRS[handle];
  const box = elementBox(el);
  const c = rectCenter(box);
  const anchor = rotatePoint(
    { x: c.x - (dir.x * box.w) / 2, y: c.y - (dir.y * box.h) / 2 },
    c,
    el.rotation,
  );
  const local = rotatePoint(pointer, anchor, -el.rotation);
  let w = dir.x === 0 ? box.w : Math.max(minSize, dir.x * (local.x - anchor.x));
  let h = dir.y === 0 ? box.h : Math.max(minSize, dir.y * (local.y - anchor.y));
  if (keepAspect && dir.x !== 0 && dir.y !== 0 && box.w > 0 && box.h > 0) {
    const s = Math.max(w / box.w, h / box.h);
    w = box.w * s;
    h = box.h * s;
  }
  const center = rotatePoint(
    { x: anchor.x + (dir.x * w) / 2, y: anchor.y + (dir.y * h) / 2 },
    anchor,
    el.rotation,
  );
  const patch: ElementPatch = {
    x: round2(center.x - w / 2),
    y: round2(center.y - h / 2),
    w: round2(w),
    h: round2(h),
  };
  if (el.type === 'freehand' && el.points) {
    patch.points = scalePoints(el.points, box.w > 0 ? w / box.w : 1, box.h > 0 ? h / box.h : 1);
  }
  return patch;
}

/**
 * Xoay theo con trỏ: tay nắm xoay treo phía TRÊN nên con trỏ ngay phía trên tâm = 0°, bên phải = 90°.
 * `snapDeg` (vd 15) để bấm bội số góc — người dùng hay muốn đúng 0/90/180.
 */
export function rotateElement(el: WhiteboardElement, pointer: Vec2, snapDeg = 0): ElementPatch {
  const c = elementCenter(el);
  let deg = radToDeg(Math.atan2(pointer.y - c.y, pointer.x - c.x)) + 90;
  if (snapDeg > 0) deg = Math.round(deg / snapDeg) * snapDeg;
  return { rotation: normalizeAngle(round2(deg)) };
}

/** Kéo một đầu của `line`/`arrow` tới `pointer`; đầu kia đứng yên. `rotation` được "nướng" vào hai đầu. */
export function moveLineEndpoint(
  el: WhiteboardElement,
  which: 'end' | 'start',
  pointer: Vec2,
): ElementPatch {
  const { start, end } = lineEndpoints(el);
  return which === 'start' ? endpointsToFields(pointer, end) : endpointsToFields(start, pointer);
}
