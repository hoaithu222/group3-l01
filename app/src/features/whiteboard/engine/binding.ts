import { BINDABLE_TYPES } from './element.constants';
import type { ElementPatch, PatchMap, Vec2, WhiteboardElement } from './element.types';
import { applyPatch } from './elements';
import { elementBox, elementCenter, rectCenter, rotatePoint } from './geometry';
import { pointInsideElement } from './hit-test';
import { endpointsToFields, lineEndpoints } from './line';
import { moveLineEndpoint } from './manipulate';

export const isBindable = (el: WhiteboardElement): boolean =>
  (BINDABLE_TYPES as readonly string[]).includes(el.type);

/**
 * Điểm trên VIỀN `target` mà tia từ TÂM `target` hướng tới `toward` cắt qua. Đầu mũi tên đậu ở đây nên nhìn như
 * "chạm mép hình" chứ không xuyên vào tâm. Hình xoay được xử lý trong khung chưa xoay rồi xoay ngược lại.
 * Ellipse dùng công thức chuẩn hoá `1 / √((dx/a)² + (dy/b)²)`; các loại còn lại coi là hình chữ nhật.
 */
export function bindingPoint(target: WhiteboardElement, toward: Vec2): Vec2 {
  const box = elementBox(target);
  const c = rectCenter(box);
  const local = rotatePoint(toward, c, -target.rotation);
  const dx = local.x - c.x;
  const dy = local.y - c.y;
  const hw = box.w / 2;
  const hh = box.h / 2;
  if ((dx === 0 && dy === 0) || hw <= 0 || hh <= 0) return c;
  const t =
    target.type === 'ellipse'
      ? 1 / Math.sqrt((dx / hw) ** 2 + (dy / hh) ** 2)
      : Math.min(hw / Math.abs(dx), hh / Math.abs(dy));
  return rotatePoint({ x: c.x + dx * t, y: c.y + dy * t }, c, target.rotation);
}

/**
 * Tính lại hai đầu mũi tên theo hình nó dính vào. Trả `null` nếu không có gì phải đổi.
 * Đầu dính hướng về TÂM hình ở đầu kia (nếu đầu kia cũng dính) hoặc về vị trí tự do của đầu kia — kết quả xác
 * định, không phụ thuộc thứ tự tính (không lặp lại "đầu A dịch theo B rồi B dịch theo A").
 * Hình bị xoá / không còn dính được → GỠ binding (bản vá `undefined`) thay vì để mũi tên trỏ vào hư không.
 */
export function resolveArrow(
  arrow: WhiteboardElement,
  byId: ReadonlyMap<string, WhiteboardElement>,
): ElementPatch | null {
  if (arrow.type !== 'arrow') return null;
  const find = (b?: { elementId: string }): WhiteboardElement | undefined => {
    const target = b ? byId.get(b.elementId) : undefined;
    return target && isBindable(target) ? target : undefined;
  };
  const from = find(arrow.startBinding);
  const to = find(arrow.endBinding);
  const patch: ElementPatch = {};
  if (arrow.startBinding && !from) patch.startBinding = undefined;
  if (arrow.endBinding && !to) patch.endBinding = undefined;
  if (!from && !to) return Object.keys(patch).length > 0 ? patch : null;

  const { start, end } = lineEndpoints(arrow);
  const nextStart = from ? bindingPoint(from, to ? elementCenter(to) : end) : start;
  const nextEnd = to ? bindingPoint(to, from ? elementCenter(from) : start) : end;
  return { ...patch, ...endpointsToFields(nextStart, nextEnd) };
}

/**
 * Sau khi vá hình (di chuyển/đổi cỡ/xoay), bổ sung bản vá cho MỌI mũi tên dính vào hình vừa đổi, để mũi tên đi
 * theo hình (WB "binding mũi tên cập nhật khi di chuyển hình"). `elements` là trạng thái TRƯỚC khi vá. Gộp vào
 * cùng `PatchMap` để adapter ghi tất cả trong MỘT transaction — mũi tên không bao giờ lệch hình ở một
 * nhịp trung gian mà người khác nhìn thấy.
 */
export function withArrowRebinding(
  elements: readonly WhiteboardElement[],
  patches: PatchMap,
): PatchMap {
  const next = new Map(elements.map((el) => [el.id, el]));
  for (const [id, patch] of patches) {
    const el = next.get(id);
    if (el) next.set(id, applyPatch(el, patch));
  }
  const out: PatchMap = new Map(patches);
  for (const el of next.values()) {
    const a = el.startBinding?.elementId;
    const b = el.endBinding?.elementId;
    if (el.type !== 'arrow' || !((a && patches.has(a)) || (b && patches.has(b)))) continue;
    const fix = resolveArrow(el, next);
    if (fix) out.set(el.id, { ...out.get(el.id), ...fix });
  }
  return out;
}

/** Phần tử "dính được" TRÊN CÙNG dưới `p` (bên trong hình, kể cả hình không tô), bỏ qua `exclude`. */
export function findBindingTarget(
  elements: readonly WhiteboardElement[],
  p: Vec2,
  { tolerance = 0, exclude = [] }: { tolerance?: number; exclude?: readonly string[] } = {},
): WhiteboardElement | null {
  for (let i = elements.length - 1; i >= 0; i--) {
    const el = elements[i];
    if (!el || el.locked || !isBindable(el) || exclude.includes(el.id)) continue;
    if (pointInsideElement(el, p, tolerance)) return el;
  }
  return null;
}

/**
 * Kéo MỘT đầu mũi tên tới `pointer`: nếu thả trên một hình thì dính vào (đầu mút bật ra viền hình), nếu không
 * thì gỡ dính ở đầu đó. Đầu còn lại giữ nguyên (kể cả binding của nó).
 */
export function dragArrowEndpoint(
  elements: readonly WhiteboardElement[],
  arrow: WhiteboardElement,
  which: 'end' | 'start',
  pointer: Vec2,
  tolerance = 0,
): ElementPatch {
  const patch: ElementPatch = moveLineEndpoint(arrow, which, pointer);
  if (arrow.type !== 'arrow') return patch;
  const target = findBindingTarget(elements, pointer, { tolerance, exclude: [arrow.id] });
  const binding = target ? { elementId: target.id } : undefined;
  if (which === 'start') patch.startBinding = binding;
  else patch.endBinding = binding;
  const byId = new Map(elements.map((el) => [el.id, el]));
  const fix = resolveArrow(applyPatch(arrow, patch), byId);
  return fix ? { ...patch, ...fix } : patch;
}
