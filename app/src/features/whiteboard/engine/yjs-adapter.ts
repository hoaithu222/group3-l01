import * as Y from 'yjs';

import { getElementsMap, getOrderArray } from './doc-schema';
import { parseElement, sanitizePatch } from './element-sanitize';
import { WB_LIMITS } from './element.constants';
import type { AddResult, PatchMap, WhiteboardElement, WriteContext } from './element.types';

/**
 * ⛔ Mọi hàm ghi ở đây chạy trong MỘT `doc.transact(fn, ctx.userId)`. `origin = userId` không phải chi tiết
 * trang trí: `Y.UndoManager({ trackedOrigins: new Set([userId]) })` (history.ts) chỉ hoàn tác transaction
 * có origin đó — WB-03 "undo chỉ của mình". Ghi bằng `doc.transact(fn)` trần thì thao tác đó KHÔNG bao giờ
 * undo được, và ghi bằng origin khác thì lọt vào undo của người khác.
 */

export const elementsMaxOf = (ctx: Pick<WriteContext, 'elementsMax'>): number =>
  ctx.elementsMax ?? WB_LIMITS.elementsMax;

/** `updatedAt` là số NGUYÊN >= 0 (ms) theo hợp đồng schema — `ctx.now` do caller đưa vào có thể lẻ. */
const nowOf = (ctx: Pick<WriteContext, 'now'>): number =>
  Math.max(0, Math.round(ctx.now ?? Date.now()));

/** Còn thêm được bao nhiêu phần tử (>= 0) — UI dùng để báo "sắp đầy" và chặn công cụ vẽ. */
export const remainingCapacity = (
  doc: Y.Doc,
  elementsMax: number = WB_LIMITS.elementsMax,
): number => Math.max(0, elementsMax - getElementsMap(doc).size);

/**
 * Thêm phần tử (WB-02: chặn ở client khi đã đủ trần). Tất cả hoặc không gì cả: dán/nhân bản 10 phần tử khi chỉ
 * còn chỗ cho 4 thì từ chối cả nhóm chứ không thêm dở dang.
 * `createdBy`/`updatedBy`/`updatedAt` luôn đóng dấu lại theo `ctx` — không cho caller giả người tạo.
 * ⚠️ Chặn ở đây chỉ là chặn CỤC BỘ: hai máy cùng thêm ở sát trần vẫn có thể gộp thành vượt vài phần tử; chốt cuối
 * là BE (`WB_007`, be.md §5) — client không cố "tự sửa" vì xoá phần tử của người khác là còn tệ hơn.
 */
export function addElements(
  doc: Y.Doc,
  elements: readonly WhiteboardElement[],
  ctx: WriteContext,
): AddResult {
  if (elements.length === 0) return { ok: true };
  const map = getElementsMap(doc);
  const max = elementsMaxOf(ctx);
  if (map.size + elements.length > max) return { ok: false, reason: 'limit', max };

  const now = nowOf(ctx);
  const parsed: WhiteboardElement[] = [];
  const seen = new Set<string>();
  for (const el of elements) {
    const p = parseElement({ ...el, createdBy: ctx.userId, updatedBy: ctx.userId, updatedAt: now });
    if (!p) return { ok: false, reason: 'invalid' };
    if (map.has(p.id) || seen.has(p.id)) return { ok: false, reason: 'exists' };
    seen.add(p.id);
    parsed.push(p);
  }
  doc.transact(() => {
    for (const p of parsed) map.set(p.id, new Y.Map<unknown>(Object.entries(p)));
    getOrderArray(doc).push(parsed.map((p) => p.id));
  }, ctx.userId);
  return { ok: true };
}

export const addElement = (doc: Y.Doc, el: WhiteboardElement, ctx: WriteContext): AddResult =>
  addElements(doc, [el], ctx);

function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Vá nhiều phần tử trong MỘT transaction, TỪNG TRƯỜNG một khoá `Y.Map` — nên một người đổi màu và một người dời
 * hình cùng lúc đều được giữ (WB-01). Chỉ ghi trường THỰC SỰ đổi (giá trị bằng nhau thì bỏ qua): không sinh bản
 * cập nhật rỗng và không tranh chấp trường vô cớ. Phần tử không tồn tại thì bỏ qua. Trả số phần tử đã đổi.
 * ⚠️ Chỉ gọi khi NHẢ TAY (README §2) — gọi mỗi frame kéo là phình lịch sử CRDT.
 */
export function updateElements(doc: Y.Doc, patches: PatchMap, ctx: WriteContext): number {
  const map = getElementsMap(doc);
  const now = nowOf(ctx);
  let changed = 0;
  doc.transact(() => {
    for (const [id, raw] of patches) {
      const ym = map.get(id);
      if (!ym) continue;
      let dirty = false;
      for (const [key, value] of Object.entries(sanitizePatch(raw))) {
        if (value === undefined) {
          if (ym.has(key)) {
            ym.delete(key);
            dirty = true;
          }
        } else if (!sameValue(ym.get(key), value)) {
          ym.set(key, value);
          dirty = true;
        }
      }
      if (dirty) {
        ym.set('updatedBy', ctx.userId);
        ym.set('updatedAt', now);
        changed++;
      }
    }
  }, ctx.userId);
  return changed;
}

const BINDING_KEYS = ['startBinding', 'endBinding'] as const;

/**
 * Xoá phần tử khỏi `elements` VÀ `order`, đồng thời gỡ dính của mọi mũi tên đang trỏ vào chúng (mũi tên trỏ vào
 * hư không sẽ bị vẽ về gốc toạ độ). Trả số phần tử đã xoá thật.
 */
export function removeElements(doc: Y.Doc, ids: readonly string[], ctx: WriteContext): number {
  const map = getElementsMap(doc);
  const doomed = new Set(ids.filter((id) => map.has(id)));
  if (doomed.size === 0) return 0;
  const now = nowOf(ctx);
  doc.transact(() => {
    for (const id of doomed) map.delete(id);
    const order = getOrderArray(doc);
    const list = order.toArray();
    for (let i = list.length - 1; i >= 0; i--) {
      if (doomed.has(list[i] ?? '')) order.delete(i, 1);
    }
    map.forEach((ym) => {
      let dirty = false;
      for (const key of BINDING_KEYS) {
        const b = ym.get(key) as { elementId?: string } | undefined;
        if (b?.elementId !== undefined && doomed.has(b.elementId)) {
          ym.delete(key);
          dirty = true;
        }
      }
      if (dirty) {
        ym.set('updatedBy', ctx.userId);
        ym.set('updatedAt', now);
      }
    });
  }, ctx.userId);
  return doomed.size;
}
