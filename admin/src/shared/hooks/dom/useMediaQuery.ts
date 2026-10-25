import { useEffect, useState } from 'react';

/** Track a CSS media query. */
export function useMediaQuery(query: string): boolean {
  /**
   * Đọc `matchMedia` NGAY trong lazy initializer.
   *
   * Khởi tạo cứng `false` thì khung hình đầu luôn là nhánh desktop, rồi effect
   * mới sửa lại — tức mọi máy tính bảng nháy qua bố cục sai một frame. Đúng
   * loại nháy hình mà `useElementSize` đã cất công tránh bằng `useLayoutEffect`.
   *
   * Vẫn phải phòng `matchMedia` không tồn tại: môi trường kiểm thử và render
   * phía máy chủ đều không có nó.
   */
  const [matches, setMatches] = useState(
    () => typeof window !== 'undefined' && window.matchMedia?.(query).matches === true,
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mql = window.matchMedia(query);
    setMatches(mql.matches);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [query]);

  return matches;
}

/** Preset: < 768px */
export function useIsMobile() {
  return useMediaQuery('(max-width: 767px)');
}

/** Preset: 768px – 1023px */
export function useIsTablet() {
  return useMediaQuery('(min-width: 768px) and (max-width: 1023px)');
}

/** Preset: 1366px – 1600px */
export function useIsLaptop() {
  return useMediaQuery('(min-width: 1366px) and (max-width: 1600px)');
}

/** Preset: >= 1024px */
export function useIsDesktop() {
  return useMediaQuery('(min-width: 1024px)');
}

/**
 * Người dùng đang thao tác bằng NGÓN TAY (không có con trỏ để rê).
 *
 * Đây là bản JS của biến thể `touch:` khai trong `globals.css` — giữ ĐÚNG cùng
 * một điều kiện để CSS và JS không bao giờ nói hai chuyện khác nhau.
 *
 *   iPad chạm ngón            → true
 *   iPad + bàn phím Magic     → false (có trackpad → con trỏ thật)
 *   Mọi PC / laptop           → false
 *
 * ⛔ ĐỪNG thay bằng kiểm tra bề rộng màn. iPad Pro 12.9" nằm ngang cho viewport
 *    1366px — trùng đúng dải laptop 14", nên không mốc bề rộng nào tách được hai
 *    thứ đó. Xem `docs/rules/ipad-responsive.md §1`.
 */
export function useIsCoarsePointer() {
  return useMediaQuery('(hover: none) and (pointer: coarse)');
}

/**
 * Người dùng đã YÊU CẦU HỆ ĐIỀU HÀNH giảm chuyển động.
 *
 * Đây là bản JS của `motion-reduce:` trong Tailwind — giữ ĐÚNG cùng điều kiện
 * để CSS và JS không nói hai chuyện khác nhau.
 *
 * ⛔ Đây KHÔNG phải một tuỳ chọn trang trí. Với người bị rối loạn tiền đình,
 *    chuyển động không mong muốn gây chóng mặt và buồn nôn thật sự. Mọi hiệu
 *    ứng TỰ CHẠY (số đếm lên, bảng tự cuộn, sóng nước) PHẢI hỏi hook này và
 *    nhảy thẳng tới trạng thái cuối, chứ không phải chạy nhanh hơn.
 */
export function usePrefersReducedMotion() {
  return useMediaQuery('(prefers-reduced-motion: reduce)');
}
