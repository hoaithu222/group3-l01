import {
  elementBox,
  lineEndpoints,
  selectionBox,
  type Rect,
  type Vec2,
  type WhiteboardElement,
} from '../../engine';

/**
 * Hình học của khung chọn — MỘT nguồn cho cả lớp phủ (vẽ khung + tay nắm) và bộ xử lý cử chỉ (chạm tay nắm nào), để hai bên không lệch nhau:
 *  · `single`: MỘT phần tử (không phải đường) — hộp chưa xoay + `rotation` của chính nó, đủ 8 tay nắm + tay nắm xoay;
 *  · `line`: MỘT đường/mũi tên — chỉ hai đầu mút (đổi kích thước bằng KÉO ĐẦU MÚT, engine không có `resizeBox` cho đường);
 *  · `group`: nhiều phần tử — hộp bao trục-song-song của các hộp đã xoay, không xoay, đủ tay nắm.
 */
export type SelectionGeometry =
  | { box: Rect; kind: 'group'; rotation: 0 }
  | { box: Rect; kind: 'single'; rotation: number }
  | { box: Rect; end: Vec2; kind: 'line'; rotation: 0; start: Vec2 };

export function selectionGeometry(
  selected: readonly WhiteboardElement[],
): SelectionGeometry | null {
  const first = selected[0];
  if (!first) return null;
  if (selected.length > 1) {
    const box = selectionBox(selected);
    return box ? { box, kind: 'group', rotation: 0 } : null;
  }
  if (first.type === 'line' || first.type === 'arrow') {
    const { end, start } = lineEndpoints(first);
    const box = {
      h: Math.abs(end.y - start.y),
      w: Math.abs(end.x - start.x),
      x: Math.min(start.x, end.x),
      y: Math.min(start.y, end.y),
    };
    return { box, end, kind: 'line', rotation: 0, start };
  }
  return { box: elementBox(first), kind: 'single', rotation: first.rotation };
}
