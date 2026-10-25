import { WB_LIMITS } from './element.constants';
import type { Vec2, WhiteboardElement } from './element.types';
import { aabbOf, round2 } from './geometry';
import { distanceToSegment } from './intersect';

/**
 * Ramer–Douglas–Peucker: bỏ điểm nằm trong `epsilon` của đoạn nối hai đầu, luôn giữ điểm ĐẦU và CUỐI.
 * Dùng ngăn xếp tường minh thay vì đệ quy: nét vẽ tay 10 giây ra hàng nghìn mẫu, đệ quy sâu theo số điểm
 * trong trường hợp xấu (nét gần thẳng) có thể tràn ngăn xếp của Hermes.
 */
export function rdp(points: readonly Vec2[], epsilon: number): Vec2[] {
  const n = points.length;
  if (n < 3) return points.slice();
  const keep = new Uint8Array(n);
  keep[0] = 1;
  keep[n - 1] = 1;
  const stack: [number, number][] = [[0, n - 1]];
  while (stack.length > 0) {
    const range = stack.pop();
    if (!range) break;
    const [start, end] = range;
    const a = points[start];
    const b = points[end];
    if (!a || !b) continue;
    let maxDist = -1;
    let index = -1;
    for (let i = start + 1; i < end; i++) {
      const p = points[i];
      if (!p) continue;
      const d = distanceToSegment(p, a, b);
      if (d > maxDist) {
        maxDist = d;
        index = i;
      }
    }
    if (index > 0 && maxDist > epsilon) {
      keep[index] = 1;
      stack.push([start, index], [index, end]);
    }
  }
  return points.filter((_, i) => keep[i] === 1);
}

export interface SimplifyOptions {
  /** Dung sai theo đơn vị THẾ GIỚI. Caller lấy `pixel / zoom` để nét trông như nhau ở mọi mức zoom. */
  epsilon?: number;
  /** Mặc định 500 điểm/nét (README §10) = 1000 số, khớp `WB_LIMITS.pointsMax`. */
  maxPoints?: number;
}

/**
 * Làm mượt nét khi THẢ TAY (không làm mỗi frame): bỏ điểm trùng/không hữu hạn, chạy RDP, và nếu vẫn quá
 * `maxPoints` thì nới `epsilon` dần (×1.5) cho tới khi vừa. Điểm đầu/cuối luôn được giữ.
 * Vòng nới có chặn trên; cuối cùng vẫn quá thì cắt đều — bảo đảm cứng ≤ `maxPoints`, vì trần này là điều kiện
 * để BE chấp nhận phần tử (`points` > 1000 số bị schema từ chối).
 */
export function simplifyStroke(
  points: readonly Vec2[],
  { epsilon = 1, maxPoints = WB_LIMITS.pointsMax / 2 }: SimplifyOptions = {},
): Vec2[] {
  const clean = points.filter((p, i) => {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return false;
    const prev = points[i - 1];
    return !prev || prev.x !== p.x || prev.y !== p.y;
  });
  let out = rdp(clean, epsilon);
  let eps = Math.max(epsilon, 0.01);
  for (let guard = 0; out.length > maxPoints && guard < 40; guard++) {
    eps *= 1.5;
    out = rdp(out, eps);
  }
  if (out.length > maxPoints) {
    const last = out[out.length - 1];
    out = out.slice(0, Math.max(1, maxPoints - 1));
    if (last) out.push(last);
  }
  return out;
}

export const flattenPoints = (points: readonly Vec2[]): number[] =>
  points.flatMap((p) => [p.x, p.y]);

export function unflattenPoints(flat: readonly number[]): Vec2[] {
  const out: Vec2[] = [];
  for (let i = 0; i + 1 < flat.length; i += 2) out.push({ x: flat[i] ?? 0, y: flat[i + 1] ?? 0 });
  return out;
}

type FreehandFields = Pick<WhiteboardElement, 'h' | 'points' | 'w' | 'x' | 'y'>;

/**
 * Dãy mẫu THẾ GIỚI (lúc vẽ) → trường của phần tử `freehand`: làm mượt, tính hộp bao, đổi sang toạ độ TƯƠNG ĐỐI
 * theo góc hộp (để kéo nét chỉ đổi `x,y` — xem `WhiteboardElement`), làm tròn 2 chữ số. Chạm một cái không kéo
 * (1 điểm) vẫn ra 2 điểm trùng nhau để Skia vẽ được chấm tròn thay vì nét rỗng.
 */
export function strokeToFreehandFields(
  worldPoints: readonly Vec2[],
  options?: SimplifyOptions,
): FreehandFields {
  const simplified = simplifyStroke(worldPoints, options);
  const first = simplified[0] ?? { x: 0, y: 0 };
  const pts = simplified.length < 2 ? [first, first] : simplified;
  const box = aabbOf(pts);
  return {
    x: round2(box.x),
    y: round2(box.y),
    w: round2(box.w),
    h: round2(box.h),
    points: flattenPoints(pts.map((p) => ({ x: round2(p.x - box.x), y: round2(p.y - box.y) }))),
  };
}
