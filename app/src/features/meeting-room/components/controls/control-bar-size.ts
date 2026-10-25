import { useSyncExternalStore } from 'react';

export interface ControlBarSize {
  height: number;
  width: number;
}

/**
 * Kích thước THẬT của thanh điều khiển phòng họp (đo bằng `onLayout` của `MeetingControlBar`) — để thanh cảm xúc nổi
 * (`ReactionsPicker`, mở trong `Modal` riêng nên không đo được vị trí thanh) đậu ngay TRÊN thanh (dọc) / ngay TRÁI cột (ngang).
 *
 * ⚠️ Đo thay vì đoán hằng số: nhãn dưới nút xuống 2 dòng ở máy 320dp / chữ hệ thống 130% nên thanh cao 80–110dp tuỳ máy. Chỉ có MỘT
 * phòng họp mở tại một lúc ⇒ một bản ghi cấp module là đủ (không cần context/store).
 */
let current: ControlBarSize = { height: 0, width: 0 };
const listeners = new Set<() => void>();

export function publishControlBarSize(next: ControlBarSize): void {
  if (next.height === current.height && next.width === current.width) return;
  current = { height: next.height, width: next.width };
  listeners.forEach((listener) => listener());
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const read = (): ControlBarSize => current;

export function useControlBarSize(): ControlBarSize {
  return useSyncExternalStore(subscribe, read, read);
}
