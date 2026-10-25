/**
 * @file useColumnResize.ts
 * @description Hook kéo giãn chiều rộng cột cho `<Table>` (kit2). Lưu width
 * override theo `key` cột, quản lý drag qua pointer event trên window để kéo
 * mượt cả khi con trỏ rời khỏi handle. Opt-in — Table truyền `enabled`.
 */

import { useCallback, useRef, useState } from 'react';

interface UseColumnResizeParams {
  /** Bật tính năng resize. */
  enabled: boolean;
  /** Chiều rộng tối thiểu mỗi cột (px). Default 60. */
  minWidth?: number;
}

export interface ColumnResizeApi {
  /** Width override (px) theo key cột — cột chưa kéo thì không có key. */
  widths: Record<string, number>;
  /** Bắt đầu kéo: truyền key cột + width hiện tại của `<th>` + pointer event. */
  onResizeStart: (key: string, startWidth: number, e: React.PointerEvent) => void;
  /** Key cột đang kéo (để tô đậm handle) — null nếu không kéo. */
  resizingKey: string | null;
}

/** Quản lý state + drag handler cho resize cột của Table. */
export function useColumnResize({
  enabled,
  minWidth = 60,
}: UseColumnResizeParams): ColumnResizeApi {
  const [widths, setWidths] = useState<Record<string, number>>({});
  const [resizingKey, setResizingKey] = useState<string | null>(null);
  const drag = useRef<{ key: string; startX: number; startWidth: number } | null>(null);

  const onResizeStart = useCallback(
    (key: string, startWidth: number, e: React.PointerEvent) => {
      if (!enabled) return;
      // Ngăn trigger sort/click header + bôi đen text khi kéo.
      e.preventDefault();
      e.stopPropagation();
      drag.current = { key, startX: e.clientX, startWidth };
      setResizingKey(key);
      // Ép cursor col-resize TOÀN trang khi kéo (class dùng chung với Splitter).
      document.body.classList.add('splitter-resizing-x');

      const handleMove = (ev: PointerEvent) => {
        const d = drag.current;
        if (!d) return;
        const next = Math.max(minWidth, d.startWidth + (ev.clientX - d.startX));
        setWidths((prev) => ({ ...prev, [d.key]: next }));
      };
      const handleUp = () => {
        drag.current = null;
        setResizingKey(null);
        document.body.classList.remove('splitter-resizing-x');
        window.removeEventListener('pointermove', handleMove);
        window.removeEventListener('pointerup', handleUp);
        window.removeEventListener('pointercancel', handleUp);
      };
      window.addEventListener('pointermove', handleMove);
      window.addEventListener('pointerup', handleUp);
      // ⛔ BẮT BUỘC — hệ điều hành huỷ chuỗi pointer khi có cuộc gọi đến, vuốt
      // mở Control Center… Thiếu nó thì `pointerup` không bao giờ tới: cột dính
      // theo ngón tay và <body> kẹt con trỏ col-resize. Cùng lý do đã ghi ở
      // `surfaces/Splitter.tsx`.
      window.addEventListener('pointercancel', handleUp);
    },
    [enabled, minWidth],
  );

  return { widths, onResizeStart, resizingKey };
}
