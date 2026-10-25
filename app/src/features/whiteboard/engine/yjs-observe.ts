import type * as Y from 'yjs';

import { getElementsMap, getOrderArray, readElementById, readOrder } from './doc-schema';
import type { WhiteboardElement } from './element.types';

/**
 * Cái gì vừa đổi trong Y.Doc. `changedIds` gồm phần tử được thêm/xoá/sửa BẤT KỲ trường nào; `orderChanged` khi
 * thứ tự z đổi. `local` = transaction do CHÍNH máy này tạo (kể cả undo/redo) chứ không phải update từ mạng.
 */
export interface ElementsChange {
  changedIds: ReadonlySet<string>;
  orderChanged: boolean;
  local: boolean;
}

export const emptyChange = (): ElementsChange => ({
  changedIds: new Set(),
  orderChanged: false,
  local: true,
});

/** Gộp nhiều thay đổi liên tiếp thành một — hook dồn theo `requestAnimationFrame` rồi vẽ lại MỘT lần. */
export const mergeChange = (a: ElementsChange, b: ElementsChange): ElementsChange => ({
  changedIds: new Set([...a.changedIds, ...b.changedIds]),
  orderChanged: a.orderChanged || b.orderChanged,
  local: a.local && b.local,
});

/**
 * Đăng ký nghe thay đổi (`observeDeep` trên `elements` + `observe` trên `order`). Một transaction đổi cả hai sẽ
 * gọi `listener` HAI lần (một cho mỗi loại) — người nghe gộp bằng `mergeChange`, đừng vẽ lại ở từng lần.
 * Trả hàm huỷ; ⛔ quên huỷ khi rời màn thì listener giữ Y.Doc sống mãi.
 */
export function observeElements(
  doc: Y.Doc,
  listener: (change: ElementsChange) => void,
): () => void {
  const elements = getElementsMap(doc);
  const order = getOrderArray(doc);

  const onElements = (events: Y.YEvent<Y.AbstractType<unknown>>[], tr: Y.Transaction): void => {
    const ids = new Set<string>();
    for (const ev of events) {
      if (ev.target === elements) {
        // Thêm/xoá/thay nguyên phần tử: khoá của map chính là id.
        for (const key of ev.keys.keys()) ids.add(key);
      } else {
        // Sửa một trường: đường dẫn tính từ `elements` bắt đầu bằng id phần tử.
        const id = ev.path[0];
        if (typeof id === 'string') ids.add(id);
      }
    }
    listener({ changedIds: ids, orderChanged: false, local: tr.local });
  };
  const onOrder = (_event: Y.YArrayEvent<string>, tr: Y.Transaction): void =>
    listener({ changedIds: new Set(), orderChanged: true, local: tr.local });

  elements.observeDeep(onElements);
  order.observe(onOrder);
  return () => {
    elements.unobserveDeep(onElements);
    order.unobserve(onOrder);
  };
}

/**
 * Cập nhật bộ nhớ đệm phần tử theo `change` — CHỈ đọc lại các id đổi; phần tử không đổi giữ nguyên
 * tham chiếu cũ (cần thiết để bộ vẽ Skia so sánh bằng `===` mà bỏ qua việc dựng lại đường vẽ của 5000 hình).
 */
export function applyChange(
  doc: Y.Doc,
  prev: ReadonlyMap<string, WhiteboardElement>,
  change: ElementsChange,
): Map<string, WhiteboardElement> {
  const next = new Map(prev);
  for (const id of change.changedIds) {
    const el = readElementById(doc, id);
    if (el) next.set(id, el);
    else next.delete(id);
  }
  return next;
}

/** Danh sách theo thứ tự z từ bộ nhớ đệm (bỏ id chưa có trong đệm). */
export function orderedFromCache(
  doc: Y.Doc,
  cache: ReadonlyMap<string, WhiteboardElement>,
): WhiteboardElement[] {
  const out: WhiteboardElement[] = [];
  for (const id of readOrder(doc)) {
    const el = cache.get(id);
    if (el) out.push(el);
  }
  return out;
}
