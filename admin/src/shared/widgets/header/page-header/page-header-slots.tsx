/**
 * Header page-slots — cầu nối cho phép PAGE render nội dung của mình vào
 * THANH HEADER toàn cục (tiêu đề module ở giữa, nav/action đẩy ra hai mép).
 *
 * VÌ SAO DÙNG PORTAL (không dùng store lưu ReactNode):
 *  - Portal giữ nguyên vị trí trong CÂY REACT của page → mọi context của page
 *    (router, query, provider riêng…) vẫn dùng được bình thường. Nếu đẩy node
 *    vào store rồi để `<Header>` render, component của page mất context và crash.
 *  - Không phải so sánh identity của ReactNode qua `useEffect` (nguồn gốc kinh
 *    điển của vòng lặp set-state vô tận).
 *
 * Provider đặt ở layout gốc (bọc CẢ `<Header>` lẫn `<main>`). Ngoài provider
 * (showcase, page standalone) hook trả `null` → portal bị bỏ qua, KHÔNG crash.
 *
 * Context + hook nằm ở `page-header-context.ts`.
 */
import { useCallback, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';

import {
  EMPTY_HEADER_SLOT_NODES,
  HeaderSlotNodesContext,
  HeaderSlotSetterContext,
  useHeaderSlotNode,
  type HeaderSlotName,
  type HeaderSlotNodes,
  type SetHeaderSlotNode,
} from './page-header-context';

interface HeaderSlotsProviderProps {
  children: ReactNode;
}

export function HeaderSlotsProvider({ children }: HeaderSlotsProviderProps) {
  const [nodes, setNodes] = useState<HeaderSlotNodes>(EMPTY_HEADER_SLOT_NODES);

  // Deps rỗng → identity ổn định → ref callback của Header không bao giờ đổi.
  const setNode = useCallback<SetHeaderSlotNode>((name, node) => {
    setNodes((prev) => (prev[name] === node ? prev : { ...prev, [name]: node }));
  }, []);

  return (
    <HeaderSlotSetterContext.Provider value={setNode}>
      <HeaderSlotNodesContext.Provider value={nodes}>{children}</HeaderSlotNodesContext.Provider>
    </HeaderSlotSetterContext.Provider>
  );
}

interface HeaderSlotPortalProps {
  slot: HeaderSlotName;
  children: ReactNode;
}

/**
 * Dùng TRONG PAGE — bơm `children` vào slot tương ứng trên header.
 * Render `null` khi chưa có provider / header chưa mount xong.
 */
export function HeaderSlotPortal({ slot, children }: HeaderSlotPortalProps) {
  const target = useHeaderSlotNode(slot);

  if (!target || children == null || children === false) return null;

  return createPortal(children, target);
}
