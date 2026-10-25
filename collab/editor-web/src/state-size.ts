import * as Y from "yjs";

/**
 * Ước lượng dung lượng state Yjs mà SERVER sẽ lưu (so với `stateMaxBytes`).
 * `encodeStateAsUpdate` trên Y.Doc của máy này quá lớn khi đã xoá nội dung: UndoManager giữ các phần tử đã xoá (`keep`) để hoàn tác được,
 * còn Y.Doc của server (không có UndoManager) đã GC chúng. Khi số đo thô đã gần trần (`softLimit`) thì nạp lại vào Y.Doc mới để GC rồi đo lại;
 * dưới ngưỡng thì dùng số đo thô (rẻ) — tài liệu lớn mới phải trả chi phí gấp đôi.
 */
export function estimateStateBytes(doc: Y.Doc, softLimit: number): number {
  const raw = Y.encodeStateAsUpdate(doc);
  if (raw.byteLength < softLimit) return raw.byteLength;
  const copy = new Y.Doc();
  try {
    Y.applyUpdate(copy, raw);
    return Y.encodeStateAsUpdate(copy).byteLength;
  } finally {
    copy.destroy();
  }
}
