/**
 * @file useDrawerResize.ts
 * @description Kéo đổi bề rộng một panel dạng NGĂN KÉO (trượt đè lên nội dung).
 *
 * Tách ra dùng chung vì hai phân hệ có cùng bố cục cây + panel đều cần: BIM 3D
 * (`useBim3dDrawerMode`) và Hồ sơ (`useDocumentsDrawerMode`). Phần KHÁC nhau giữa hai
 * bên — media query nào bật ngăn kéo, mở/đóng ra sao, class nào — nằm ở hook riêng của
 * từng phân hệ; ở đây chỉ giữ đúng phần cơ học của thao tác kéo.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export interface UseDrawerResizeParams {
  /** Bề rộng vùng chứa (px). `0` = chưa đo xong → chưa kẹp trần. */
  containerWidth: number;
  /** Bề rộng mở màn (px). */
  defaultWidth: number;
  /** Sàn kéo (px) — dưới mức này nội dung trong ngăn kéo hết đọc được. */
  minWidth: number;
  /** Phần bề ngang đã bị thứ khác chiếm bên trái ngăn kéo (px) — vd dải rail. */
  reservedWidth?: number;
  /** Chừa lại ít nhất bằng này px cho nội dung phía sau khi kéo hết cỡ. */
  peekWidth: number;
}

export interface UseDrawerResizeReturn {
  /** Bề rộng hiện tại, đã kẹp trong [minWidth, trần]. */
  width: number;
  /** Gắn cho tay nắm ở mép ngăn kéo. */
  handlers: {
    onPointerDown: (e: React.PointerEvent) => void;
    onPointerMove: (e: React.PointerEvent) => void;
    onPointerUp: (e: React.PointerEvent) => void;
    /** Hệ điều hành huỷ chuỗi pointer (vuốt bị hiểu thành cuộn, cuộc gọi đến…). */
    onPointerCancel: (e: React.PointerEvent) => void;
  };
}

/**
 * Dùng Pointer Capture thay vì listener trên `window`: move/up bám đúng phần tử đã bắt
 * đầu kéo nên ngón tay trượt ra ngoài tay nắm (chuyện thường xuyên trên cảm ứng) vẫn
 * không rơi thao tác, và không phải tự gỡ listener khi unmount giữa chừng.
 *
 * ⛔ Pointer Events là thứ DUY NHẤT chạy được trên iPad ở đây — Safari không giả lập sự
 * kiện chuột cho thao tác KÉO (chỉ giả lập cho cú chạm đơn), nên bản dựng bằng
 * `mousedown/mousemove` sẽ im lặng không làm gì trên máy bảng.
 *
 * ⚠️ Tay nắm BẮT BUỘC có `touch-none`: thiếu nó, cú vuốt bị trình duyệt hiểu là cuộn
 * trang, nó bắn `pointercancel` và thao tác kéo chết giữa chừng.
 */
export function useDrawerResize({
  containerWidth,
  defaultWidth,
  minWidth,
  reservedWidth = 0,
  peekWidth,
}: UseDrawerResizeParams): UseDrawerResizeReturn {
  const [rawWidth, setRawWidth] = useState(defaultWidth);
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);

  // Trần phụ thuộc vùng chứa nên phải kẹp lúc ĐỌC, không chỉ lúc kéo: xoay máy từ ngang
  // sang dọc làm khung hẹp lại, bề rộng đã lưu từ trước có thể vượt trần mới.
  const maxWidth =
    containerWidth > 0 ? containerWidth - reservedWidth - peekWidth : Number.POSITIVE_INFINITY;
  const width = Math.max(minWidth, Math.min(rawWidth, Math.max(maxWidth, minWidth)));

  // `widthRef` mirror để handler giữ deps rỗng — chỉ đọc lúc BẮT ĐẦU kéo nên vẫn nhận
  // giá trị mới nhất. ⛔ Gán trong `useEffect` (sau render), KHÔNG gán thẳng trong thân
  // hàm: React 19 cấm ghi ref lúc render (`react-hooks/refs`).
  const widthRef = useRef(width);
  useEffect(() => {
    widthRef.current = width;
  });

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startWidth: widthRef.current };
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    setRawWidth(drag.startWidth + (e.clientX - drag.startX));
  }, []);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    dragRef.current = null;
    (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
  }, []);

  return {
    width,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      // ⛔ BẮT BUỘC — hệ điều hành huỷ chuỗi pointer khi cú vuốt bị hiểu thành
      // cuộn, khi có cuộc gọi đến, khi vuốt mở Control Center… Thiếu nó thì
      // `onPointerUp` không bao giờ tới: `dragRef` còn nguyên và mọi lần rê
      // chuột qua tay nắm sau đó lại tiếp tục đổi bề rộng.
      onPointerCancel: onPointerUp,
    },
  };
}

export default useDrawerResize;
