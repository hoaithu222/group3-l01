import type { Vec2 } from '../../engine';

const HEAD_ANGLE = (150 * Math.PI) / 180;

/**
 * Ba điểm của đầu mũi tên (đỉnh + hai cánh) trong khung CHƯA xoay của phần tử: đỉnh = cuối đoạn `(x+w, y+h)`, hai cánh lệch ±150° so với hướng
 * đoạn, dài `max(10, 4 × bề dày)` để mũi tên mảnh vẫn thấy rõ và mũi tên dày không bị đầu nhỏ. Đoạn suy biến (w = h = 0) hướng sang phải.
 * Hàm thuần — tách khỏi mã vẽ để test bằng số, không cần Skia.
 */
export function arrowHead(
  el: { h: number; strokeWidth: number; w: number; x: number; y: number },
): { left: Vec2; right: Vec2; tip: Vec2 } {
  const tip = { x: el.x + el.w, y: el.y + el.h };
  const theta = el.w === 0 && el.h === 0 ? 0 : Math.atan2(el.h, el.w);
  const length = Math.max(10, el.strokeWidth * 4);
  const wing = (angle: number): Vec2 => ({
    x: tip.x + length * Math.cos(theta + angle),
    y: tip.y + length * Math.sin(theta + angle),
  });
  return { left: wing(HEAD_ANGLE), right: wing(-HEAD_ANGLE), tip };
}
