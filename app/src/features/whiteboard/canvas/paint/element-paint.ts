import { elementBox, elementCenter, type WhiteboardElement } from '../../engine';
import type { SkCanvas, SkPath } from '../skia-module';
import { arrowHead } from './arrow-head';
import type { PaintKit } from './paint-kit';
import { LINE_HEIGHT_RATIO, wrapText } from './text-layout';

const STICKY_PADDING = 10;

/** Đường vẽ của nét tự do, nhớ theo MẢNG `points` (mỗi lần đọc phần tử từ Y.Doc là mảng mới, phần tử không đổi giữ nguyên mảng) — tránh dựng lại 2000 đường mỗi lần dựng cảnh. */
const pathCache = new WeakMap<readonly number[], SkPath>();

/** Nét tự do → đường cong mượt: đi qua các điểm giữa của từng cặp mẫu liên tiếp, điểm mẫu làm điểm điều khiển (chuẩn "midpoint quad"). Toạ độ tương đối theo `(x, y)`. */
function freehandPath(kit: PaintKit, points: readonly number[]): SkPath {
  const cached = pathCache.get(points);
  if (cached) return cached;
  const path = kit.skia.Skia.Path.Make();
  const at = (i: number) => ({ x: points[i * 2] ?? 0, y: points[i * 2 + 1] ?? 0 });
  const count = Math.floor(points.length / 2);
  const first = at(0);
  path.moveTo(first.x, first.y);
  for (let i = 1; i < count - 1; i++) {
    const p = at(i);
    const next = at(i + 1);
    path.quadTo(p.x, p.y, (p.x + next.x) / 2, (p.y + next.y) / 2);
  }
  if (count > 1) {
    const last = at(count - 1);
    path.lineTo(last.x, last.y);
  }
  pathCache.set(points, path);
  return path;
}

function paintText(canvas: SkCanvas, el: WhiteboardElement, kit: PaintKit, wrapWidth: number): void {
  const fontSize = el.fontSize ?? 20;
  const font = kit.font(fontSize);
  if (!font || !el.text) return;
  const box = elementBox(el);
  const paint = kit.fill(el.strokeColor, 'stroke');
  const lines = wrapText(el.text, wrapWidth, kit.measure(fontSize));
  lines.forEach((line, index) => {
    canvas.drawText(line, box.x + (wrapWidth > 0 ? STICKY_PADDING : 0), box.y + fontSize + index * fontSize * LINE_HEIGHT_RATIO + (wrapWidth > 0 ? STICKY_PADDING : 0), paint, font);
  });
}

function paintFreehand(canvas: SkCanvas, el: WhiteboardElement, kit: PaintKit): void {
  const points = el.points ?? [];
  canvas.save();
  canvas.translate(el.x, el.y);
  const dot = points.length < 4 || (points.length === 4 && points[0] === points[2] && points[1] === points[3]);
  if (dot) canvas.drawCircle(points[0] ?? 0, points[1] ?? 0, el.strokeWidth / 2, kit.fill(el.strokeColor, 'stroke'));
  else canvas.drawPath(freehandPath(kit, points), kit.stroke(el.strokeColor, el.strokeWidth));
  canvas.restore();
}

/**
 * Vẽ MỘT phần tử lên `canvas` (thường là canvas ghi của `createPicture`, toạ độ THẾ GIỚI). Quy ước hình học khớp engine: hộp `(x, y, w, h)` chưa
 * xoay, `rotation` (độ, chiều kim đồng hồ) quanh TÂM hộp; `line`/`arrow` từ `(x, y)` tới `(x + w, y + h)` (w/h có thể âm); `freehand` toạ độ
 * tương đối theo `(x, y)`. Thứ tự: tô nền rồi mới viền. Loại chưa hỗ trợ (`image` P1) vẽ khung xám để vẫn thấy có phần tử.
 */
export function paintElement(canvas: SkCanvas, el: WhiteboardElement, kit: PaintKit): void {
  const { Skia } = kit.skia;
  const box = elementBox(el);
  const rect = Skia.XYWHRect(box.x, box.y, box.w, box.h);
  const rotated = el.rotation !== 0;
  if (rotated) {
    const c = elementCenter(el);
    canvas.save();
    canvas.rotate(el.rotation, c.x, c.y);
  }
  const stroke = () => kit.stroke(el.strokeColor, el.strokeWidth);

  if (el.type === 'rect' || el.type === 'frame' || el.type === 'image') {
    if (el.fillColor !== null && el.type !== 'frame') canvas.drawRect(rect, kit.fill(el.fillColor, 'fill'));
    canvas.drawRect(rect, stroke());
  } else if (el.type === 'ellipse') {
    if (el.fillColor !== null) canvas.drawOval(rect, kit.fill(el.fillColor, 'fill'));
    canvas.drawOval(rect, stroke());
  } else if (el.type === 'line' || el.type === 'arrow') {
    canvas.drawLine(el.x, el.y, el.x + el.w, el.y + el.h, stroke());
    if (el.type === 'arrow') {
      const { left, right, tip } = arrowHead(el);
      canvas.drawLine(tip.x, tip.y, left.x, left.y, stroke());
      canvas.drawLine(tip.x, tip.y, right.x, right.y, stroke());
    }
  } else if (el.type === 'freehand') {
    paintFreehand(canvas, el, kit);
  } else if (el.type === 'sticky') {
    canvas.drawRect(rect, kit.fill(el.fillColor ?? 'yellow', 'fill'));
    paintText(canvas, el, kit, Math.max(0, box.w - STICKY_PADDING * 2));
  } else {
    paintText(canvas, el, kit, 0);
  }
  if (rotated) canvas.restore();
}
