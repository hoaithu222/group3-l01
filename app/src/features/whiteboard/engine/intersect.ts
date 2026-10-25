import type { Rect, Vec2 } from './element.types';

export const pointInRect = (p: Vec2, r: Rect): boolean =>
  p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;

export const rectsIntersect = (a: Rect, b: Rect): boolean =>
  a.x <= b.x + b.w && b.x <= a.x + a.w && a.y <= b.y + b.h && b.y <= a.y + a.h;

export const rectContainsRect = (outer: Rect, inner: Rect): boolean =>
  inner.x >= outer.x &&
  inner.y >= outer.y &&
  inner.x + inner.w <= outer.x + outer.w &&
  inner.y + inner.h <= outer.y + outer.h;

/**
 * Hai đa giác LỒI có giao nhau không (định lý trục phân tách). Đoạn thẳng (2 điểm) cũng dùng được: pháp tuyến
 * của chính nó cộng pháp tuyến của hình kia là đủ trục để kết luận.
 */
export function polygonsIntersect(a: readonly Vec2[], b: readonly Vec2[]): boolean {
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i];
      const q = poly[(i + 1) % poly.length];
      if (!p || !q) continue;
      const nx = p.y - q.y;
      const ny = q.x - p.x;
      if (nx === 0 && ny === 0) continue;
      const [minA, maxA] = projectOnto(a, nx, ny);
      const [minB, maxB] = projectOnto(b, nx, ny);
      if (maxA < minB || maxB < minA) return false;
    }
  }
  return true;
}

function projectOnto(poly: readonly Vec2[], nx: number, ny: number): [number, number] {
  let min = Infinity;
  let max = -Infinity;
  for (const p of poly) {
    const d = p.x * nx + p.y * ny;
    min = Math.min(min, d);
    max = Math.max(max, d);
  }
  return [min, max];
}

/** Khoảng cách từ `p` đến ĐOẠN `a`–`b` (không phải đường thẳng vô hạn). `a == b` thì là khoảng cách tới điểm. */
export function distanceToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  const t =
    lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}
