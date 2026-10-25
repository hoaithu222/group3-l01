/**
 * Toán học của cử chỉ vuốt thẻ (Học thẻ): ngưỡng → quyết định "đã thuộc"/"chưa thuộc", độ đậm của lớp phủ, độ nghiêng của thẻ.
 *
 * ── Vì sao mọi hàm đều có `'worklet'` ────────────────────────────────────────────────────────────────────────────────
 * Cử chỉ chạy TRÊN LUỒNG UI (Reanimated). Hàm thường (không có chỉ thị) gọi từ worklet thì máy thật ném
 * "Tried to synchronously call a non-worklet function on the UI thread" — Jest chạy tất cả trên một luồng nên KHÔNG bắt được
 * lỗi này. ⛔ Đừng bỏ chỉ thị, và đừng import hàm ngoài file này vào worklet trừ khi chính nó cũng là worklet.
 *
 * ⚠️ Chỉ số (dp, dp/giây) đo bằng tay trên lý thuyết, CHƯA thử trên máy thật — chỉnh ở ĐÂY nếu vuốt quá nhạy/quá nặng.
 */
export type SwipeDecision = 'known' | 'unknown' | null;

/** Vuốt quá chừng này bề rộng thẻ thì tính là quyết định (không phải lỡ tay). */
export const SWIPE_DISTANCE_RATIO = 0.28;
/** Sàn của ngưỡng (dp): thẻ hẹp không được biến một cú chạm run tay thành quyết định. */
export const SWIPE_MIN_DISTANCE = 72;
/** Hất nhanh (dp/giây) thì không cần đi đủ quãng đường... */
export const FLICK_VELOCITY = 900;
/** ...nhưng vẫn phải đi ít nhất chừng này. */
export const FLICK_MIN_DISTANCE = 28;
/** Độ nghiêng tối đa của thẻ khi kéo (độ). */
export const MAX_TILT_DEG = 12;
/** Thẻ bay ra ngoài mép: bề rộng × hệ số này (đủ để nghiêng + đổ bóng cũng khuất). */
export const FLY_OUT_RATIO = 1.25;
/** Bề rộng dự phòng khi `onLayout` chưa báo (khung đầu tiên) — tránh thẻ "bay" 0dp. */
export const FALLBACK_WIDTH = 360;

export function swipeThreshold(width: number): number {
  'worklet';
  return Math.max(SWIPE_MIN_DISTANCE, width * SWIPE_DISTANCE_RATIO);
}

/**
 * Sang phải ⇒ `'known'`, sang trái ⇒ `'unknown'`, chưa đủ ⇒ `null` (thẻ bật về chỗ cũ).
 *
 * `vx` chỉ dùng để (a) nhận cú hất nhanh chưa đủ quãng đường, (b) HUỶ quyết định khi người dùng kéo qua ngưỡng rồi hất NGƯỢC
 * lại thật mạnh — họ đổi ý ngay lúc thả, đừng bắt họ chịu.
 */
export function decideSwipe(dx: number, vx: number, width: number): SwipeDecision {
  'worklet';
  const direction = dx >= 0 ? 1 : -1;
  const distance = Math.abs(dx);
  const along = vx * direction;
  const decision = direction === 1 ? 'known' : 'unknown';
  if (distance >= swipeThreshold(width)) return along > -FLICK_VELOCITY ? decision : null;
  if (distance >= FLICK_MIN_DISTANCE && along >= FLICK_VELOCITY) return decision;
  return null;
}

/** 0 → 1 theo quãng đường so với ngưỡng — độ đậm của nhãn "Đã thuộc"/"Chưa thuộc" và độ "trồi lên" của thẻ kế. */
export function swipeStrength(dx: number, width: number): number {
  'worklet';
  return Math.min(1, Math.abs(dx) / swipeThreshold(width));
}

/** Độ nghiêng (độ, có dấu) — kéo sang phải nghiêng theo chiều kim đồng hồ. Kẹp ±`MAX_TILT_DEG`. */
export function tiltDegrees(dx: number, width: number): number {
  'worklet';
  const span = Math.max(1, width);
  return Math.max(-MAX_TILT_DEG, Math.min(MAX_TILT_DEG, (dx / span) * MAX_TILT_DEG * 2));
}

/** Quãng đường thẻ bay ra (dp, có dấu theo hướng). */
export function flyOutDistance(direction: 'known' | 'unknown', width: number): number {
  'worklet';
  const span = width > 0 ? width : FALLBACK_WIDTH;
  return (direction === 'known' ? 1 : -1) * span * FLY_OUT_RATIO;
}
