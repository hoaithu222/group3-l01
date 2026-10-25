import type * as Y from 'yjs';

import { getOrderArray, healOrder, readElementById, readOrder } from './doc-schema';
import type {
  Binding,
  DuplicateResult,
  Vec2,
  WhiteboardElement,
  WriteContext,
} from './element.types';
import { newElementId } from './elements';
import { round2 } from './geometry';
import { addElements } from './yjs-adapter';
import { zOrderMoves, type ZMode } from './z-order';

/**
 * Đổi thứ tự z của các phần tử (menu nhấn giữ "đưa lên/xuống"). Trong MỘT transaction: trước hết `healOrder` làm
 * sạch mảng (id trùng do hai máy cùng đổi thứ tự), rồi áp từng bước rút/chèn của `zOrderMoves`.
 * Trả `true` nếu có gì đổi.
 */
export function reorderElements(
  doc: Y.Doc,
  ids: readonly string[],
  mode: ZMode,
  ctx: WriteContext,
): boolean {
  let changed = false;
  doc.transact(() => {
    const order = getOrderArray(doc);
    const clean = healOrder(doc);
    for (const { from, to } of zOrderMoves(clean, new Set(ids), mode)) {
      const id = order.get(from);
      order.delete(from, 1);
      order.insert(to, [id]);
      changed = true;
    }
  }, ctx.userId);
  return changed;
}

/**
 * Nhân bản phần tử, dời `offset`, đặt lên TRÊN CÙNG theo thứ tự z cũ. Mũi tên dính vào hình cũng được nhân bản thì
 * dính sang bản sao tương ứng; dính vào hình KHÔNG nhân bản thì gỡ dính (bản sao không được kéo bản gốc theo).
 * Đi qua `addElements` nên chịu cùng trần 5000 và cùng luật đóng dấu.
 */
export function duplicateElements(
  doc: Y.Doc,
  ids: readonly string[],
  offset: Vec2,
  ctx: WriteContext,
): DuplicateResult {
  const wanted = new Set(ids);
  const source: WhiteboardElement[] = [];
  for (const id of readOrder(doc)) {
    const el = wanted.has(id) ? readElementById(doc, id) : null;
    if (el) source.push(el);
  }
  const idMap = new Map(source.map((el) => [el.id, newElementId()]));
  const remap = (b?: Binding): Binding | undefined => {
    const to = b ? idMap.get(b.elementId) : undefined;
    return to ? { elementId: to } : undefined;
  };
  const copies = source.map((el): WhiteboardElement => {
    const { startBinding, endBinding, ...rest } = el;
    const copy: WhiteboardElement = {
      ...rest,
      id: idMap.get(el.id) ?? newElementId(),
      x: round2(el.x + offset.x),
      y: round2(el.y + offset.y),
    };
    const start = remap(startBinding);
    const end = remap(endBinding);
    if (start) copy.startBinding = start;
    if (end) copy.endBinding = end;
    return copy;
  });
  const result = addElements(doc, copies, ctx);
  return result.ok ? { ok: true, ids: copies.map((c) => c.id) } : result;
}
