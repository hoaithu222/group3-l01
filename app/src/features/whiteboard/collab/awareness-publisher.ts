import type { Awareness } from 'y-protocols/awareness';

import type { Vec2 } from '../engine';
import { AWARENESS } from '../constants/whiteboard.constants';
import { createLatestThrottle } from './throttle';

export interface AwarenessPublisher {
  destroy: () => void;
  /** Đẩy NGAY bản đang chờ (rời màn) — con trỏ cuối không kẹt ở chỗ cũ trên máy người khác tới khi hết hạn 30 s. */
  flush: () => void;
  /** Vị trí con trỏ/ngón tay trong toạ độ THẾ GIỚI; `null` = rời khỏi canvas. */
  pointer: (point: Vec2 | null) => void;
  /** Phần tử đang chọn (cắt còn `AWARENESS.selectionMax` id). */
  selection: (ids: readonly string[]) => void;
}

/** Số byte UTF-8 của chuỗi — tên tiếng Việt có dấu ≈ 2–3 byte/ký tự nên `length` đếm thiếu. */
export function utf8Length(text: string): number {
  let bytes = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
  }
  return bytes;
}

interface Snapshot {
  pointer: Vec2 | null;
  selection: readonly string[];
}

const round1 = (n: number): number => Math.round(n * 10) / 10;

/**
 * Phát trạng thái awareness của MÌNH (con trỏ + vùng chọn) — chỉ ĐÚNG các khoá collab cho phép với bảng trắng: `pointer`, `selection`
 * (`user` đặt một lần ở `hocuspocus-port.ts`). ⛔ KHÔNG có `cursor`/`tool`/`draft` như README p6-02 §5: khoá lạ làm server ĐÓNG kết nối
 * (`awareness-invalid`); nét đang vẽ cũng KHÔNG phát cho người khác ở P0 — chỉ hiện cục bộ rồi ghi vào Y.Doc một transaction khi nhả tay.
 *
 *  · Throttle ≤ `AWARENESS.maxHz` (30) lần/giây, giá trị mới nhất thắng (`createLatestThrottle`). Server còn có trần riêng 60/giây/kết nối: vượt
 *    thì BỎ tin (không đóng) — nên throttle ở đây là để tiết kiệm băng thông, không phải để khỏi bị đóng.
 *  · MỘT `setLocalState` cho cả hai khoá ⇒ MỘT tin mỗi lượt (gọi `setLocalStateField` hai lần là hai tin).
 *  · Mỗi state ≤ `AWARENESS.maxBytes` (2 KiB): quá thì bỏ `selection` (phần co giãn duy nhất) chứ không gửi để rồi bị đóng.
 */
export function createAwarenessPublisher(
  awareness: Awareness,
  maxHz: number = AWARENESS.maxHz,
): AwarenessPublisher {
  let current: Snapshot = { pointer: null, selection: [] };
  let lastWritten = '';

  const write = (snap: Snapshot): void => {
    const { pointer: _pointer, selection: _selection, ...rest } = awareness.getLocalState() ?? {};
    const withSelection = {
      ...rest,
      ...(snap.pointer ? { pointer: snap.pointer } : {}),
      ...(snap.selection.length > 0 ? { selection: snap.selection.slice(0, AWARENESS.selectionMax) } : {}),
    };
    const json = JSON.stringify(withSelection);
    const next = utf8Length(json) <= AWARENESS.maxBytes ? withSelection : { ...rest, ...(snap.pointer ? { pointer: snap.pointer } : {}) };
    const key = JSON.stringify(next);
    if (key === lastWritten) return;
    lastWritten = key;
    awareness.setLocalState(next);
  };

  const throttle = createLatestThrottle<Snapshot>(write, maxHz);
  const push = (patch: Partial<Snapshot>): void => {
    current = { ...current, ...patch };
    throttle.push(current);
  };

  return {
    destroy: () => throttle.cancel(),
    flush: () => throttle.flush(),
    pointer: (point) => push({ pointer: point ? { x: round1(point.x), y: round1(point.y) } : null }),
    selection: (ids) => push({ selection: ids }),
  };
}
