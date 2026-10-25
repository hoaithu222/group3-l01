import { neighborsAt, type Neighbors } from '../../../utils/move-neighbors';

/**
 * Tính vị trí thả THUẦN — không React, không Reanimated, không đo màn hình —
 * để test được mọi ca đầu/giữa/cuối cột (`drop-target.test.ts`) tách khỏi UI
 * (`app.md` §6: "thêm test hành vi `drop-target.ts` tách khỏi UI").
 *
 * Hệ toạ độ:
 *  · điểm ngón tay + hộp cột: toạ độ CỬA SỔ (`measureInWindow`, `absoluteX/Y`);
 *  · hộp thẻ: toạ độ NỘI DUNG của list (đã cộng phần đệm đầu list), cùng hệ với
 *    `scrollY`. Đổi từ điểm cửa sổ sang nội dung: `y - column.top + column.scrollY`.
 */
export interface Point {
  x: number;
  y: number;
}

export interface CardBox {
  height: number;
  id: string;
  top: number;
}

export interface ColumnBox {
  /** Thứ tự HIỂN THỊ của thẻ (gồm cả thẻ đang kéo). */
  cards: readonly CardBox[];
  columnId: string;
  height: number;
  left: number;
  scrollY: number;
  top: number;
  width: number;
}

export interface DropTarget extends Neighbors {
  columnId: string;
  /** Khe chèn trong danh sách ĐÃ bỏ thẻ đang kéo. */
  index: number;
}

/** Cột chứa `x`; ngoài mọi cột (khe hở, mép) thì lấy cột có tâm gần nhất — thả lệch một chút vẫn có chỗ đến. */
export function findColumnAt(x: number, columns: readonly ColumnBox[]): ColumnBox | null {
  let best: ColumnBox | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const column of columns) {
    if (x >= column.left && x < column.left + column.width) return column;
    const distance = Math.abs(x - (column.left + column.width / 2));
    if (distance < bestDistance) {
      best = column;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * Khe chèn theo chiều dọc: số thẻ (không kể thẻ đang kéo) có TÂM nằm trên điểm
 * thả. Dùng tâm chứ không phải mép trên: thả nửa dưới của một thẻ nghĩa là "sau
 * thẻ đó", đúng cảm giác của Trello.
 */
export function slotIndexAt(
  contentY: number,
  cards: readonly CardBox[],
  movingId: string,
): number {
  let slot = 0;
  for (const card of cards) {
    if (card.id === movingId) continue;
    if (card.top + card.height / 2 < contentY) slot += 1;
  }
  return slot;
}

export function resolveDropTarget(
  point: Point,
  columns: readonly ColumnBox[],
  movingId: string,
): DropTarget | null {
  const column = findColumnAt(point.x, columns);
  if (!column) return null;
  const contentY = point.y - column.top + column.scrollY;
  const index = slotIndexAt(contentY, column.cards, movingId);
  const ids = column.cards.map((card) => card.id);
  return { columnId: column.columnId, index, ...neighborsAt(ids, movingId, index) };
}

/**
 * Thả về ĐÚNG chỗ cũ (cùng cột, cùng khe) — không gọi server, không đổi version.
 * Khe của thẻ trong danh sách đã bỏ chính nó bằng đúng chỉ số hiện tại của nó.
 */
export function isSamePlace(
  fromColumnId: string,
  currentColumnIds: readonly string[],
  movingId: string,
  target: DropTarget,
): boolean {
  if (target.columnId !== fromColumnId) return false;
  return currentColumnIds.indexOf(movingId) === target.index;
}
