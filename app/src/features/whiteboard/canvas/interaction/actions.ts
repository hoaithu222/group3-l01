import {
  addElement,
  createElement,
  duplicateElements,
  removeElements,
  reorderElements,
  updateElements,
  type ElementPatch,
  type PatchMap,
  type ZMode,
} from '../../engine';
import type { TextEditTarget, ToolStyle } from '../../store/whiteboard-ui.store';
import { textBox, type MeasureFn } from '../paint/text-layout';
import { DUPLICATE_OFFSET } from './interaction.constants';
import type { InteractionEnv } from './interaction.types';

/** Xoá phần tử đang chọn (một transaction; mũi tên dính vào chúng được gỡ dính). */
export function deleteSelection(env: InteractionEnv): void {
  const ids = [...env.selection()];
  if (ids.length === 0) return;
  removeElements(env.doc, ids, env.write());
  env.setSelection([]);
}

/** Nhân bản: bản sao dời `DUPLICATE_OFFSET`, nằm trên cùng; chọn luôn bản sao. Chạm trần → `reportLimit` (tất cả hoặc không gì cả). */
export function duplicateSelection(env: InteractionEnv): void {
  const ids = [...env.selection()];
  if (ids.length === 0) return;
  const result = duplicateElements(env.doc, ids, { x: DUPLICATE_OFFSET, y: DUPLICATE_OFFSET }, env.write());
  if (result.ok) env.setSelection(result.ids);
  else if (result.reason === 'limit') env.reportLimit();
}

/** "Đưa lên trên/xuống dưới" (menu nhấn giữ, README §3): đổi thứ tự z bằng rút/chèn từng phần tử, không ghi đè cả mảng `order`. */
export function reorderSelection(env: InteractionEnv, mode: ZMode): void {
  const ids = [...env.selection()];
  if (ids.length > 0) reorderElements(env.doc, ids, mode, env.write());
}

/**
 * Xong tấm soạn chữ. TẠO MỚI: chỉ ghi vào Y.Doc khi có chữ (chữ trống không để lại phần tử rác trong CRDT); kích thước lấy từ đo thật (`measure`
 * — Skia hoặc xấp xỉ), giấy nhớ giữ khung 160×160 mặc định của engine. SỬA: cập nhật `text` (và hộp cho chữ tự do); chữ tự do bị xoá sạch thì
 * xoá luôn phần tử, giấy nhớ trống thì giữ.
 */
export function commitText(
  env: InteractionEnv,
  target: TextEditTarget,
  text: string,
  measure: (fontSize: number) => MeasureFn,
): void {
  const style = env.style();
  const ctx = env.write();
  if (target.mode === 'create') {
    if (text.trim() === '') return;
    const box = target.type === 'text' ? textBox(text, style.fontSize, measure(style.fontSize)) : null;
    const el = createElement(
      target.type,
      {
        fontSize: style.fontSize,
        strokeColor: style.stroke,
        text,
        x: target.at.x,
        y: target.at.y,
        ...(target.type === 'sticky' && style.fill ? { fillColor: style.fill } : {}),
        ...(box ?? {}),
      },
      { userId: ctx.userId },
    );
    const result = addElement(env.doc, el, ctx);
    if (result.ok) env.setSelection([el.id]);
    else if (result.reason === 'limit') env.reportLimit();
    return;
  }
  const el = env.elements().find((item) => item.id === target.id);
  if (!el) return;
  if (el.type === 'text' && text.trim() === '') {
    removeElements(env.doc, [el.id], ctx);
    env.setSelection([]);
    return;
  }
  const fontSize = el.fontSize ?? style.fontSize;
  const box = el.type === 'text' ? textBox(text, fontSize, measure(fontSize)) : {};
  updateElements(env.doc, new Map([[el.id, { text, ...box }]]), ctx);
}

/**
 * Đổi kiểu cho phần tử ĐANG CHỌN (panel "Kiểu vẽ"): màu nét → mọi loại; tô nền → chỉ hình chữ nhật/elip/giấy nhớ (giấy nhớ không bao giờ về "không
 * tô" — sẽ trong suốt); bề dày → hình/đường/nét (chữ và giấy nhớ không có nét); cỡ chữ → chữ/giấy nhớ (chữ tự do đo lại hộp). MỘT transaction, từng
 * TRƯỜNG một nên hai người đổi hai trường khác nhau của cùng phần tử đều được giữ (WB-01).
 */
export function styleSelection(
  env: InteractionEnv,
  patch: Partial<ToolStyle>,
  measure: (fontSize: number) => MeasureFn,
): void {
  const ids = new Set(env.selection());
  const patches: PatchMap = new Map();
  for (const el of env.elements()) {
    if (!ids.has(el.id) || el.locked) continue;
    const next: ElementPatch = {};
    const shaped = el.type === 'rect' || el.type === 'ellipse' || el.type === 'sticky';
    const texty = el.type === 'text' || el.type === 'sticky';
    if (patch.stroke !== undefined) next.strokeColor = patch.stroke;
    if (patch.fill !== undefined && shaped && !(el.type === 'sticky' && patch.fill === null)) {
      next.fillColor = patch.fill;
    }
    if (patch.width !== undefined && !texty) next.strokeWidth = patch.width;
    if (patch.fontSize !== undefined && texty) {
      next.fontSize = patch.fontSize;
      if (el.type === 'text') Object.assign(next, textBox(el.text ?? '', patch.fontSize, measure(patch.fontSize)));
    }
    if (Object.keys(next).length > 0) patches.set(el.id, next);
  }
  if (patches.size > 0) updateElements(env.doc, patches, env.write());
}
