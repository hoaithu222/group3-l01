import type * as Y from 'yjs';

import type { WhiteboardElement } from './element.types';
import { parseElement } from './element-sanitize';

/**
 * Cấu trúc Y.Doc (be.md §2.1) — tên khoá gốc là HỢP ĐỒNG với BE (`WhiteboardStateInspector` đếm
 * `elements.size`) và với `collab/`; đổi tên ở đây mà không đổi phía kia thì bảng cũ đọc ra rỗng.
 *   elements: Y.Map<elementId, Y.Map>  — mỗi trường phần tử là MỘT khoá (WB-01)
 *   order:    Y.Array<elementId>       — thứ tự z, cuối mảng = trên cùng
 *   meta:     Y.Map { background }
 */
export const getElementsMap = (doc: Y.Doc): Y.Map<Y.Map<unknown>> =>
  doc.getMap<Y.Map<unknown>>('elements');
export const getOrderArray = (doc: Y.Doc): Y.Array<string> => doc.getArray<string>('order');
export const getMetaMap = (doc: Y.Doc): Y.Map<unknown> => doc.getMap<unknown>('meta');

/** Số phần tử = `elements.size` — đúng cách BE đếm, nên trần 5000 hai phía nhất quán. */
export const countElements = (doc: Y.Doc): number => getElementsMap(doc).size;

/** Khoá của map là sự thật về id; trường `id` bên trong (nếu lệch) bị ghi đè. */
export function readElementById(doc: Y.Doc, id: string): WhiteboardElement | null {
  const ym = getElementsMap(doc).get(id);
  return ym ? parseElement({ ...ym.toJSON(), id }) : null;
}

/**
 * Làm sạch mảng thứ tự đọc từ CRDT. Hai máy cùng "đưa lên trên" một phần tử (= xoá + chèn cuối) làm id xuất
 * hiện HAI lần sau khi gộp; id còn sót sau khi phần tử bị xoá cũng có thể có. Quy tắc: giữ lần xuất hiện CUỐI
 * (trên cùng), bỏ id không còn trong `elements`, id mồ côi (có trong `elements`, thiếu trong `order`) xếp cuối
 * theo id — sắp theo id để mọi máy ra CÙNG thứ tự, không phụ thuộc thứ tự lặp của Y.Map cục bộ.
 */
export function cleanOrder(raw: readonly string[], ids: ReadonlySet<string>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (let i = raw.length - 1; i >= 0; i--) {
    const id = raw[i];
    if (id !== undefined && ids.has(id) && !seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  out.reverse();
  const orphans = [...ids].filter((id) => !seen.has(id)).sort();
  return out.concat(orphans);
}

/** Thứ tự z đã làm sạch (chỉ ĐỌC, không sửa doc). */
export const readOrder = (doc: Y.Doc): string[] =>
  cleanOrder(getOrderArray(doc).toArray(), new Set(getElementsMap(doc).keys()));

/**
 * Sửa thật mảng `order` nếu nó bẩn (xem `cleanOrder`); trả mảng sạch. Chỉ gọi BÊN TRONG transaction ghi
 * (đổi thứ tự z) — không tự chạy nền, vì hai máy cùng sửa một lúc lại sinh trùng lặp mới.
 */
export function healOrder(doc: Y.Doc): string[] {
  const order = getOrderArray(doc);
  const raw = order.toArray();
  const clean = cleanOrder(raw, new Set(getElementsMap(doc).keys()));
  if (raw.length === clean.length && raw.every((id, i) => id === clean[i])) return raw;
  order.delete(0, order.length);
  order.insert(0, clean);
  return clean;
}

/** Toàn bộ phần tử theo thứ tự z (dưới → trên), bỏ phần tử hỏng. Đọc đầy đủ tốn O(n) — sau đó dùng `applyChange`. */
export function readElements(doc: Y.Doc): WhiteboardElement[] {
  const out: WhiteboardElement[] = [];
  for (const id of readOrder(doc)) {
    const el = readElementById(doc, id);
    if (el) out.push(el);
  }
  return out;
}
