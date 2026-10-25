/**
 * Số học thuần của cử chỉ zoom/vuốt-đóng ở `ZoomableImage` — tách ra để test được mà không cần cử chỉ thật (Jest không mô
 * phỏng được pinch/pan). Mọi hàm là worklet: chạy được cả trên luồng UI của Reanimated lẫn trong test.
 */

/** Zoom tối đa (lần). */
export const MAX_SCALE = 4;
/** Zoom khi chạm đúp lần đầu (lần). */
export const DOUBLE_TAP_SCALE = 2.5;
/** Kéo xuống quá chừng này (dp) thì đóng. */
export const DISMISS_DISTANCE = 120;
/** Hoặc vuốt nhanh hơn chừng này (dp/s) thì đóng. */
export const DISMISS_VELOCITY = 800;
/** Trên ngưỡng này coi là "đang zoom" (dung sai cho sai số dấu phẩy động sau khi pinch về 1). */
export const ZOOMED_EPSILON = 1.02;

export function clamp(value: number, min: number, max: number): number {
  'worklet';
  return Math.min(max, Math.max(min, value));
}

/** Zoom mới sau khi pinch: `saved` × hệ số của cử chỉ, kẹp trong [1, MAX_SCALE]. */
export function pinchScale(saved: number, gestureScale: number): number {
  'worklet';
  return clamp(saved * gestureScale, 1, MAX_SCALE);
}

/** Đã zoom tới mức đáng kể chưa (để khoá cuộn ngang của pager). */
export function isZoomed(scale: number): boolean {
  'worklet';
  return scale > ZOOMED_EPSILON;
}

/**
 * Được kéo ảnh sang hai bên tối đa bao nhiêu dp (mỗi phía) khi phóng `scale` lần trong khung `size`: phần ảnh phóng thừa ra ngoài
 * khung, chia đôi cho hai phía. Không phóng (scale ≤ 1) thì không kéo được.
 */
export function panLimit(size: number, scale: number): number {
  'worklet';
  return Math.max(0, (size * scale - size) / 2);
}

/** Chạm đúp: đang zoom thì về 1, chưa zoom thì lên `DOUBLE_TAP_SCALE`. */
export function doubleTapScale(current: number): number {
  'worklet';
  return isZoomed(current) ? 1 : DOUBLE_TAP_SCALE;
}

/** Thả tay sau khi kéo xuống (chưa zoom): đóng nếu kéo đủ xa hoặc đủ nhanh. Kéo LÊN không bao giờ đóng. */
export function shouldDismiss(translationY: number, velocityY: number): boolean {
  'worklet';
  return translationY > DISMISS_DISTANCE || (translationY > 0 && velocityY > DISMISS_VELOCITY);
}
