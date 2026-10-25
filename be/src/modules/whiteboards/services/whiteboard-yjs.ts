/**
 * Thao tác THUẦN trên state Yjs (`Uint8Array` = `Y.encodeStateAsUpdate`) riêng của bảng trắng: KHÔI PHỤC snapshot bằng cách thay `elements` + `order`
 * (cùng khuôn `replaceFragmentContent` của tài liệu ở `shared/collab/yjs-state.ts`, nhưng cho Y.Map/Y.Array). Hợp nhất hai state dùng `mergeYjsStates` chung.
 */
import * as Y from "yjs";
import { WHITEBOARD_ROOT } from "./whiteboard-element.schema";

function docFrom(state: Uint8Array | null | undefined): Y.Doc {
  const doc = new Y.Doc();
  if (state && state.byteLength > 0) Y.applyUpdate(doc, state);
  return doc;
}

export interface ContentReplacement {
  /** State đầy đủ SAU khi thay — ghi vào `Whiteboard.yjsState`. */
  newState: Uint8Array;
  /** Chỉ phần THAY ĐỔI — gửi cho collab (`/internal/apply`) áp lên các phiên đang mở. */
  delta: Uint8Array;
  /** Số phần tử sau khi thay (= số phần tử của snapshot). */
  elementCount: number;
}

/**
 * Khôi phục: trong MỘT transaction Yjs (origin `restore`) xoá hết `elements`/`order` hiện tại rồi chèn bản sao của snapshot. Không thay `Y.Doc`, nên đây là một
 * update như mọi update khác — áp được lên mọi bản sao đang mở và hợp nhất đúng với thứ người khác đang vẽ (không phá lịch sử CRDT của client).
 * `meta` (nền lưới/chấm) giữ nguyên. `delta` tính từ state vector TRƯỚC khi sửa nên đúng cho bản sao đã đồng bộ tới state hiện tại.
 */
export function replaceWhiteboardContent(current: Uint8Array | null, snapshot: Uint8Array): ContentReplacement {
  const doc = docFrom(current);
  const source = docFrom(snapshot);
  const before = Y.encodeStateVector(doc);
  const elements = doc.getMap(WHITEBOARD_ROOT.elements);
  const order = doc.getArray<string>(WHITEBOARD_ROOT.order);
  const fromElements = source.getMap(WHITEBOARD_ROOT.elements);
  const fromOrder = source.getArray<string>(WHITEBOARD_ROOT.order);

  doc.transact(() => {
    for (const key of [...elements.keys()]) elements.delete(key);
    if (order.length > 0) order.delete(0, order.length);
    fromElements.forEach((value, key) => {
      // Phần tử là Y.Map lồng nhau: phải `clone()` (không thể gắn cùng một kiểu chia sẻ vào hai Y.Doc).
      elements.set(key, value instanceof Y.AbstractType ? (value as Y.Map<unknown>).clone() : value);
    });
    const ids = fromOrder.toArray();
    if (ids.length > 0) order.push(ids);
  }, "restore");

  const result: ContentReplacement = {
    newState: Y.encodeStateAsUpdate(doc),
    delta: Y.encodeStateAsUpdate(doc, before),
    elementCount: elements.size,
  };
  doc.destroy();
  source.destroy();
  return result;
}
