import type { GanttEdgeDto } from '../api/critical-path.types';
import type { BarGeometry, BarRect } from './gantt-layout';

/**
 * Mũi tên phụ thuộc của Gantt — toạ độ THUẦN (app.md §2 `GanttArrows`), tách khỏi `gantt-layout.ts` để mỗi file một việc.
 * Mỗi hàng cao `row.height` gồm dòng tên thẻ ở trên và thanh ở dưới; mũi tên nối theo TÂM THANH chứ không theo tâm hàng.
 */

/** Hình chữ nhật của THANH (không gồm dòng tên) trong hàng `geometry` — điểm neo của mũi tên. */
export function barRect(geometry: BarGeometry, labelHeight: number, barHeight: number): BarRect {
  return { height: barHeight, width: geometry.width, x: geometry.x, y: geometry.y + labelHeight };
}

/**
 * Đường nối FINISH→START: từ MÉP PHẢI thanh trước tới MÉP TRÁI thanh sau. Đủ chỗ (≥ 2 lần `gap`) thì gập khuỷu
 * ở giữa; thẻ sau bắt đầu SỚM hơn/sát hạn thẻ trước (xung đột lịch) thì vòng qua khe GIỮA hai hàng để đường không
 * chui xuyên thanh. Toạ độ chạm đúng mép để test kiểm được điểm đầu/cuối.
 */
export function arrowPath(from: BarRect, to: BarRect, gap: number): string {
  const x1 = from.x + from.width;
  const y1 = from.y + from.height / 2;
  const x2 = to.x;
  const y2 = to.y + to.height / 2;

  if (x2 >= x1 + 2 * gap) {
    const mid = x1 + (x2 - x1) / 2;
    return `M ${x1} ${y1} H ${mid} V ${y2} H ${x2}`;
  }
  // Khe ngay dưới hàng thẻ trước (thẻ sau ở hàng dưới) hoặc ngay trên nó (thẻ sau ở hàng trên).
  const laneY = y2 >= y1 ? from.y + from.height : from.y;
  return `M ${x1} ${y1} H ${x1 + gap} V ${laneY} H ${x2 - gap} V ${y2} H ${x2}`;
}

/** Mũi tên nhọn tại `(tipX, tipY)` hướng sang phải. */
export function arrowHeadPath(tipX: number, tipY: number, size = 5): string {
  return `M ${tipX} ${tipY} L ${tipX - size} ${tipY - size} L ${tipX - size} ${tipY + size} Z`;
}

/** Cạnh cần vẽ = có ít nhất một đầu nằm trong dải hàng đang vẽ. */
export function visibleEdges(
  edges: readonly GanttEdgeDto[],
  rowIndexOf: ReadonlyMap<string, number>,
  range: { first: number; last: number },
): GanttEdgeDto[] {
  const inRange = (index: number | undefined) =>
    index !== undefined && index >= range.first && index <= range.last;
  return edges.filter(
    (edge) => inRange(rowIndexOf.get(edge.predecessorId)) || inRange(rowIndexOf.get(edge.successorId)),
  );
}
