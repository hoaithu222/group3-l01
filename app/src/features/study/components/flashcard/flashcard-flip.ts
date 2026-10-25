/**
 * Toán học của thẻ LẬT 3D: hai mặt cùng nằm trong cây, `progress` 0 (mặt trước) → 1 (mặt sau) dẫn cả hai.
 *
 * ── Vì sao có CẢ `backfaceVisibility` lẫn công tắc `opacity` ─────────────────────────────────────────────────────────
 * `backfaceVisibility: 'hidden'` là cách "đúng" nhưng hành xử lệch giữa các đời Android/GPU (đã gặp mặt sau lộ ra qua mặt trước
 * khi có `elevation`/`overflow`). Công tắc `opacity` đổi ĐÚNG lúc thẻ nằm nghiêng 90° (lúc đó thẻ chỉ còn là một nét mỏng nên mắt
 * không thấy cú nhảy) và không phụ thuộc GPU — nên cái nào hỏng thì cái kia vẫn giữ. ⚠️ Chưa thấy trên máy thật.
 *
 * ── Vì sao `'worklet'` ───────────────────────────────────────────────────────────────────────────────────────────────
 * Các hàm này chạy trong `useAnimatedStyle` (luồng UI) — xem cùng chú thích ở `flashcard-swipe.ts`.
 */
export type FlipSide = 'front' | 'back';

/** Khoảng cách camera (dp) — nhỏ quá thì méo, lớn quá thì thấy phẳng như xoay 2D. */
export const FLIP_PERSPECTIVE = 1000;
export const FLIP_MS = 380;
/** "Giảm chuyển động": không xoay, chỉ chuyển mờ — ngắn hơn để không bắt người dùng chờ một hiệu ứng họ đã tắt. */
export const FLIP_REDUCED_MS = 150;

/** Mặt trước đi 0° → 180°; mặt sau đi −180° → 0° (đã "lật sẵn" nên khi thẻ tới 180° thì mặt sau đọc thuận). */
export function flipAngle(progress: number, side: FlipSide): number {
  'worklet';
  return side === 'front' ? progress * 180 : progress * 180 - 180;
}

/** Xoay: công tắc ở 90° (nghiêng hẳn). Giảm chuyển động: chuyển mờ liên tục. */
export function faceOpacity(progress: number, side: FlipSide, reduceMotion: boolean): number {
  'worklet';
  if (reduceMotion) return side === 'front' ? 1 - progress : progress;
  const showingBack = progress >= 0.5;
  return (side === 'back') === showingBack ? 1 : 0;
}
