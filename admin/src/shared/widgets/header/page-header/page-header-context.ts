/**
 * Header page-slots — CONTEXT + hook (tách khỏi file component để
 * react-refresh không cảnh báo "file chỉ nên export component").
 *
 * VÌ SAO 2 CONTEXT RIÊNG:
 *  - `SetterContext` — hàm `setNode`, identity ỔN ĐỊNH vĩnh viễn. Callback ref
 *    của `<Header>` chỉ phụ thuộc hàm này; nếu ref callback đổi identity mỗi
 *    lần node đổi, React sẽ detach → attach → set state → VÒNG LẶP VÔ TẬN.
 *  - `NodesContext` — bản đồ DOM node, đổi khi header mount/unmount slot.
 */
import { createContext, useCallback, useContext } from 'react';

/** `start` = mép trái · `title` = cụm tâm · `end` = mép phải. */
export type HeaderSlotName = 'start' | 'title' | 'end';

export type HeaderSlotNodes = Record<HeaderSlotName, HTMLElement | null>;
export type SetHeaderSlotNode = (name: HeaderSlotName, node: HTMLElement | null) => void;

export const EMPTY_HEADER_SLOT_NODES: HeaderSlotNodes = {
  start: null,
  title: null,
  end: null,
};

export const HeaderSlotNodesContext = createContext<HeaderSlotNodes>(EMPTY_HEADER_SLOT_NODES);
export const HeaderSlotSetterContext = createContext<SetHeaderSlotNode | null>(null);

/**
 * Dùng TRONG `<Header>` — trả callback ref gắn vào container của slot.
 * Identity ổn định nên React chỉ gọi 1 lần lúc mount, 1 lần lúc unmount.
 */
export function useHeaderSlotRef(name: HeaderSlotName) {
  const setNode = useContext(HeaderSlotSetterContext);
  return useCallback((node: HTMLElement | null) => setNode?.(name, node), [setNode, name]);
}

/** DOM node của một slot — `null` khi chưa có provider hoặc header chưa mount. */
export function useHeaderSlotNode(name: HeaderSlotName): HTMLElement | null {
  return useContext(HeaderSlotNodesContext)[name];
}
