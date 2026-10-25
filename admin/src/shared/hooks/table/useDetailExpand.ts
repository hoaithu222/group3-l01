/**
 * useDetailExpand — phóng to / thu nhỏ MỘT khối panel ra TOÀN MÀN HÌNH.
 *
 * CÁCH LÀM: KHÔNG dùng Fullscreen API và KHÔNG portal khối nội dung đi nơi khác.
 * Chỉ đổi class của chính node gốc sang `fixed inset-0` →
 *
 *  1. Node KHÔNG bị unmount/di chuyển trong cây React ⇒ canvas WebGL của viewer
 *     3D (hoặc bất kỳ state nội bộ tốn kém khác — ReactFlow, chart…) giữ nguyên
 *     context, không phải tải lại. Portal hay `requestFullscreen()` trên một
 *     node khác đều làm mất điều này.
 *  2. Modal của app (Radix) portal xuống `document.body` với `z-50`, nằm SAU khối
 *     layout trong DOM ⇒ vẫn hiện ĐÈ LÊN lớp phóng to. Fullscreen API thì ngược
 *     lại: mọi portal ở ngoài element fullscreen sẽ biến mất.
 *  3. `<main>` của `BackgroundLayout` là `relative z-10` còn `<Header>` render với
 *     `sticky={false}` (không z-index) ⇒ lớp `fixed` nằm trong `<main>` phủ trọn
 *     header + dock, đúng yêu cầu "không bị ảnh hưởng bởi header".
 *     ⚠️ Nếu sau này bọc thêm ancestor có `transform`/`filter`/`will-change`,
 *     `position: fixed` sẽ neo vào ancestor đó thay vì viewport → hỏng.
 */

import { useCallback, useEffect, useState } from 'react';

interface DetailExpand {
  expanded: boolean;
  toggle: () => void;
}

export function useDetailExpand(): DetailExpand {
  const [expanded, setExpanded] = useState(false);

  const toggle = useCallback(() => setExpanded((v) => !v), []);

  // Esc để thoát — nhưng NHƯỜNG cho dialog đang mở (Esc của dialog là đóng dialog,
  // không phải thu nhỏ cả khối bên dưới nó).
  useEffect(() => {
    if (!expanded) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if (document.querySelector('[role="dialog"][data-state="open"]')) return;
      setExpanded(false);
      // Nút toggle vẫn giữ focus sau khi bấm (hành vi mặc định của browser) →
      // bỏ focus để tắt outline/focus-ring bám lại trên nút sau khi đã thu nhỏ.
      (document.activeElement as HTMLElement | null)?.blur();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [expanded]);

  // Kích thước container đổi mà KHÔNG có resize của window → Splitter, Recharts,
  // ReactFlow và canvas viewer không tự đo lại. Bắn 1 event `resize` sau khi
  // layout đã vẽ xong.
  useEffect(() => {
    const raf = requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
    return () => cancelAnimationFrame(raf);
  }, [expanded]);

  return { expanded, toggle };
}
