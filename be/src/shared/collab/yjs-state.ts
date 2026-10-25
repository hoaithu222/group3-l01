/**
 * Thao tác THUẦN trên trạng thái Yjs (`Uint8Array` = `Y.encodeStateAsUpdate`) mà BE cần mà không phụ thuộc ProseMirror/Tiptap:
 * hợp nhất hai state (PUT state với base version cũ) và thay toàn bộ nội dung một `Y.XmlFragment` bằng nội dung của snapshot (khôi phục).
 * Dùng lại được cho bảng trắng (p6-02) bằng hàm thay `Y.Map`/`Y.Array` riêng của module đó.
 */
import * as Y from "yjs";

/** Tên `Y.XmlFragment` chứa nội dung tài liệu — Tiptap `Collaboration` mặc định (`field: "default"`). Client PHẢI dùng đúng tên này. */
export const DOCUMENT_FRAGMENT = "default";

/** Doc có GC (mặc định) để `encodeStateAsUpdate` gọn — khớp `yDocOptions.gc: true` của Hocuspocus. */
function docFrom(...states: Array<Uint8Array | null | undefined>): Y.Doc {
  const doc = new Y.Doc();
  for (const state of states) if (state && state.byteLength > 0) Y.applyUpdate(doc, state);
  return doc;
}

/**
 * Hợp nhất hai state (CRDT: giao hoán, lũy đẳng) và nén lại. Dùng khi collab PUT với base version cũ hơn version hiện có
 * (có ai ghi xen giữa — khôi phục snapshot, instance khác): kết quả chứa cả hai, KHÔNG ghi đè.
 */
export function mergeYjsStates(a: Uint8Array | null, b: Uint8Array): Uint8Array {
  const doc = docFrom(a, b);
  const merged = Y.encodeStateAsUpdate(doc);
  doc.destroy();
  return merged;
}

export interface FragmentReplacement {
  /** State đầy đủ SAU khi thay — ghi vào `Document.yjsState`. */
  newState: Uint8Array;
  /** Chỉ phần THAY ĐỔI (xoá nội dung cũ + chèn nội dung snapshot) — gửi cho collab (`/internal/apply`) áp lên phiên đang mở. */
  delta: Uint8Array;
}

/**
 * Khôi phục: trong MỘT transaction Yjs xoá hết con của fragment hiện tại rồi chèn bản sao con của fragment trong snapshot.
 * Không phá lịch sử CRDT của client đang mở (không thay `Y.Doc`): thay đổi là một update như mọi update khác nên áp lên
 * mọi bản sao và hợp nhất đúng với thứ người khác đang gõ. `delta` tính từ state vector TRƯỚC khi sửa nên đúng cho bản sao
 * đã đồng bộ tới state hiện tại.
 */
export function replaceFragmentContent(current: Uint8Array | null, snapshot: Uint8Array, field: string = DOCUMENT_FRAGMENT): FragmentReplacement {
  const doc = docFrom(current);
  const source = docFrom(snapshot);
  const before = Y.encodeStateVector(doc);
  const target = doc.getXmlFragment(field);
  const from = source.getXmlFragment(field);
  doc.transact(() => {
    if (target.length > 0) target.delete(0, target.length);
    // `XmlHook` (dữ liệu tự do) y-prosemirror không tạo ra → bỏ qua.
    const copies = from
      .toArray()
      .filter((node): node is Y.XmlElement | Y.XmlText => !(node instanceof Y.XmlHook))
      .map((node) => node.clone());
    if (copies.length > 0) target.insert(0, copies);
  }, "restore");
  const result = { newState: Y.encodeStateAsUpdate(doc), delta: Y.encodeStateAsUpdate(doc, before) };
  doc.destroy();
  source.destroy();
  return result;
}
