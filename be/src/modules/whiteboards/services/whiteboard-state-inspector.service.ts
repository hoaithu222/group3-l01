import * as Y from "yjs";
import { ValidationError } from "../../../core/exceptions";
import { isValidElement, WHITEBOARD_ROOT } from "./whiteboard-element.schema";

export interface StateInspection {
  /** `elements.size` — số phần tử còn sống (đã xoá thì không tính). */
  elementCount: number;
  /** Độ dài `order` (z-order) — lệch `elementCount` là dấu hiệu client cũ/lỗi, chỉ để chẩn đoán. */
  orderCount: number;
  /** Số phần tử sai schema (`whiteboard-element.schema.ts`) hoặc khoá ≠ `id`. */
  invalidElements: number;
}

const EMPTY: StateInspection = { elementCount: 0, orderCount: 0, invalidElements: 0 };

/**
 * Đọc state Yjs của bảng (decode vào Y.Doc tạm) để BE tự đếm phần tử — client KHÔNG được tin (be.md §5): `PUT /internal/whiteboards/:id/state` từ chối > `elementsMax`.
 * "Validate schema tối thiểu" = ĐẾM phần tử sai dạng (`invalidElements`) để cảnh báo/chẩn đoán, KHÔNG từ chối lưu: collab coi 4xx ngoài 409/413 là lỗi tạm và thử lại
 * vô hạn, nên một phần tử sai dạng (hoặc loại phần tử mới của bản app mới hơn) sẽ khoá cả bảng không lưu được; trần dung lượng 8 MiB + 5000 phần tử đã chặn lạm dụng.
 */
export class WhiteboardStateInspector {
  inspect(state: Uint8Array | null): StateInspection {
    if (!state || state.byteLength === 0) return { ...EMPTY };
    const doc = new Y.Doc();
    try {
      Y.applyUpdate(doc, state);
      const elements = doc.getMap(WHITEBOARD_ROOT.elements);
      let invalidElements = 0;
      elements.forEach((value, key) => {
        const json: unknown = value instanceof Y.AbstractType ? (value as Y.Map<unknown>).toJSON() : value;
        if (!isValidElement(key, json)) invalidElements += 1;
      });
      return { elementCount: elements.size, orderCount: doc.getArray(WHITEBOARD_ROOT.order).length, invalidElements };
    } catch (err) {
      // State không phải Yjs update hợp lệ (hỏng/cắt cụt) — collab luôn sinh bằng `encodeStateAsUpdate` nên gần như không xảy ra.
      throw new ValidationError("Trạng thái bảng trắng không hợp lệ", { reason: err instanceof Error ? err.message : "decode" });
    } finally {
      doc.destroy();
    }
  }

  /** Chỉ số phần tử — đường tắt cho snapshot/cron. */
  count(state: Uint8Array | null): number {
    return this.inspect(state).elementCount;
  }
}
