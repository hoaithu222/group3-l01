import * as Y from 'yjs';

import { getElementsMap, getOrderArray } from './doc-schema';
import { WB_LIMITS } from './element.constants';

export type HistoryResult = 'done' | 'empty' | 'limit';

export interface WhiteboardHistory {
  undo: () => HistoryResult;
  redo: () => HistoryResult;
  canUndo: () => boolean;
  canRedo: () => boolean;
  /** Xoá lịch sử (vd sau khi khôi phục snapshot — bước cũ không còn áp được lên trạng thái mới). */
  clear: () => void;
  /** Nghe thay đổi của ngăn xếp để bật/tắt nút hoàn tác/làm lại. Trả hàm huỷ. */
  subscribe: (listener: () => void) => () => void;
  destroy: () => void;
}

/**
 * Undo/redo CÁ NHÂN trên `Y.UndoManager` (WB-03).
 *
 *  · `trackedOrigins = { userId }`: chỉ transaction do mình ghi (`origin = userId`, xem yjs-adapter) mới vào ngăn
 *    xếp. Thao tác của người khác tới qua provider (origin khác) không bao giờ bị mình hoàn tác nhầm — và ngược
 *    lại. Nếu hai người sửa hai trường khác nhau của cùng một hình, undo chỉ trả lại trường CỦA MÌNH.
 *  · `captureTimeout: 0`: mặc định Yjs gộp các thay đổi cách nhau < 500 ms thành MỘT bước, tức hai nét vẽ liên
 *    tiếp nhanh sẽ bị hoàn tác cùng lúc. Ở đây mỗi transaction (= một thao tác nhả tay) là đúng một bước.
 *  · Phạm vi chỉ `elements` + `order` — không gồm `meta` (đổi nền không phải thao tác vẽ).
 *
 * ⚠️ Hoàn tác một lần XOÁ có thể làm số phần tử vượt trần nếu người khác đã thêm vào chỗ trống trong lúc đó. Khi
 * đó `undo`/`redo` tự đảo lại bước vừa làm và trả `'limit'` để UI báo "Bảng đã đầy" (WB-02), thay vì để state
 * vượt trần bị BE từ chối lúc lưu (`WB_007`).
 */
export function createHistory(
  doc: Y.Doc,
  userId: string,
  elementsMax: number = WB_LIMITS.elementsMax,
): WhiteboardHistory {
  const manager = new Y.UndoManager([getElementsMap(doc), getOrderArray(doc)], {
    trackedOrigins: new Set<unknown>([userId]),
    captureTimeout: 0,
  });

  const step = (direction: 'redo' | 'undo'): HistoryResult => {
    const map = getElementsMap(doc);
    const before = map.size;
    const item = direction === 'undo' ? manager.undo() : manager.redo();
    if (!item) return 'empty';
    if (map.size > elementsMax && map.size > before) {
      // Đảo bước vừa làm (redo của undo, hoặc ngược lại) để trả về đúng trạng thái trước đó.
      if (direction === 'undo') manager.redo();
      else manager.undo();
      return 'limit';
    }
    return 'done';
  };

  return {
    undo: () => step('undo'),
    redo: () => step('redo'),
    canUndo: () => manager.canUndo(),
    canRedo: () => manager.canRedo(),
    clear: () => {
      manager.clear();
    },
    subscribe: (listener) => {
      const events = ['stack-item-added', 'stack-item-popped', 'stack-cleared'] as const;
      for (const event of events) manager.on(event, listener);
      return () => {
        for (const event of events) manager.off(event, listener);
      };
    },
    destroy: () => {
      manager.destroy();
    },
  };
}
