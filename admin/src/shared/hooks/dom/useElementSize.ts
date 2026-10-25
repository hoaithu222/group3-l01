/**
 * useElementSize — đo kích thước thực của 1 element qua ResizeObserver.
 *
 * Dùng cho chart vẽ bằng px cố định (donut/gauge SVG) để chúng CO DÃN theo
 * container thay vì hardcode: `size = clamp(min, min(width, height), max)`.
 *
 * Usage:
 *   const [boxRef, { width, height }] = useElementSize<HTMLDivElement>();
 *   <div ref={boxRef}>…</div>
 *
 * ⚠️ Hai điểm BẮT BUỘC giữ nguyên khi sửa hook này:
 *
 * 1. **Callback ref, KHÔNG phải `useRef` + `useEffect([])`.** Bản cũ dùng
 *    `useRef` với effect deps rỗng: nếu element được render CÓ ĐIỀU KIỆN
 *    (`isLoading ? <spinner/> : <div ref={boxRef}/>`), lúc effect chạy
 *    `ref.current` vẫn là `null` → observer KHÔNG BAO GIỜ được tạo, và effect
 *    không chạy lại khi div mount sau đó → size kẹt ở `{0,0}` vĩnh viễn →
 *    consumer dùng giá trị fallback → chart tràn khung. Callback ref đưa node
 *    vào state nên effect chạy lại đúng lúc node gắn/gỡ khỏi DOM.
 *
 * 2. **`useLayoutEffect` + đo đồng bộ ngay khi gắn node.** ResizeObserver chỉ
 *    trả kết quả ở nhịp render sau; nếu chỉ chờ nó thì luôn có ≥ 1 frame
 *    consumer vẽ bằng size fallback (chart nháy to rồi co lại).
 *
 * Đo theo **content box** (trừ padding) để khớp `entry.contentRect` của
 * ResizeObserver — nếu lấy `clientWidth` trần thì lần đo đồng bộ và lần đo của
 * observer lệch nhau đúng bằng padding, gây resize nhảy.
 *
 * `set-state-in-effect` được tắt cho `src/shared/hooks/**` (xem eslint.config.js).
 */

import { useCallback, useLayoutEffect, useState } from 'react';

export interface ElementSize {
  width: number;
  height: number;
}

export function useElementSize<T extends HTMLElement>() {
  const [node, setNode] = useState<T | null>(null);
  const [size, setSize] = useState<ElementSize>({ width: 0, height: 0 });

  // Callback ref — React gọi với node khi mount, `null` khi unmount.
  const ref = useCallback((el: T | null) => setNode(el), []);

  useLayoutEffect(() => {
    if (!node) return;

    // Bỏ qua thay đổi < 1px để không re-render vì sai số làm tròn.
    const apply = (width: number, height: number) =>
      setSize((prev) =>
        Math.abs(prev.width - width) < 1 && Math.abs(prev.height - height) < 1
          ? prev
          : { width, height },
      );

    // Đo đồng bộ TRƯỚC paint → consumer không bao giờ vẽ bằng size fallback.
    const cs = getComputedStyle(node);
    apply(
      node.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight),
      node.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom),
    );

    if (typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (!box) return;
      apply(box.width, box.height);
    });

    observer.observe(node);
    return () => observer.disconnect();
  }, [node]);

  return [ref, size] as const;
}

export default useElementSize;
