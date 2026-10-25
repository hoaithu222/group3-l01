import type { Rect, Vec2 } from './element.types';
import { rectCenter, rotatePoint } from './geometry';

/** Tám tay nắm đổi kích thước theo hướng la bàn + một tay nắm xoay treo phía trên cạnh trên. */
export type HandleId = 'e' | 'n' | 'ne' | 'nw' | 'rotate' | 's' | 'se' | 'sw' | 'w';
export type ResizeHandleId = Exclude<HandleId, 'rotate'>;

/**
 * Hướng của từng tay nắm trong khung CHƯA xoay: `x`/`y` ∈ {-1, 0, 1}. Cạnh (`n`,`e`,`s`,`w`) có một thành phần
 * bằng 0 — trục đó KHÔNG đổi khi kéo tay nắm cạnh. Điểm neo (đứng yên) luôn là phía đối diện.
 */
export const HANDLE_DIRS: Record<ResizeHandleId, Vec2> = {
  nw: { x: -1, y: -1 },
  n: { x: 0, y: -1 },
  ne: { x: 1, y: -1 },
  e: { x: 1, y: 0 },
  se: { x: 1, y: 1 },
  s: { x: 0, y: 1 },
  sw: { x: -1, y: 1 },
  w: { x: -1, y: 0 },
};

/** Khoảng cách (đơn vị thế giới) từ cạnh trên tới tay nắm xoay. Caller chia cho zoom để giữ ~24 px trên màn. */
export const DEFAULT_ROTATE_OFFSET = 24;

/** Vị trí THẾ GIỚI của các tay nắm quanh `box` (đã xoay `rotation` độ quanh tâm hộp). */
export function handlePositions(
  box: Rect,
  rotation: number,
  rotateOffset = DEFAULT_ROTATE_OFFSET,
): Record<HandleId, Vec2> {
  const c = rectCenter(box);
  const at = (dir: Vec2): Vec2 =>
    rotatePoint({ x: c.x + (dir.x * box.w) / 2, y: c.y + (dir.y * box.h) / 2 }, c, rotation);
  return {
    nw: at(HANDLE_DIRS.nw),
    n: at(HANDLE_DIRS.n),
    ne: at(HANDLE_DIRS.ne),
    e: at(HANDLE_DIRS.e),
    se: at(HANDLE_DIRS.se),
    s: at(HANDLE_DIRS.s),
    sw: at(HANDLE_DIRS.sw),
    w: at(HANDLE_DIRS.w),
    rotate: rotatePoint({ x: c.x, y: box.y - rotateOffset }, c, rotation),
  };
}

/**
 * Tay nắm nào nằm dưới `p` (bán kính `radius` thế giới). Thử tay nắm xoay và các góc TRƯỚC các cạnh: hộp bé thì
 * tay nắm cạnh chồng lên góc, thứ tự này để góc thắng — đổi kích thước theo góc là thao tác hay dùng hơn.
 */
export function hitTestHandle(
  box: Rect,
  rotation: number,
  p: Vec2,
  radius: number,
  rotateOffset = DEFAULT_ROTATE_OFFSET,
): HandleId | null {
  const pos = handlePositions(box, rotation, rotateOffset);
  const order: HandleId[] = ['rotate', 'nw', 'ne', 'se', 'sw', 'n', 'e', 's', 'w'];
  for (const id of order) {
    if (Math.hypot(pos[id].x - p.x, pos[id].y - p.y) <= radius) return id;
  }
  return null;
}
