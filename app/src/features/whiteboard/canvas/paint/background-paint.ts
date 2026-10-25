import type { BackgroundKind, Rect } from '../../engine';
import type { SkCanvas } from '../skia-module';
import type { PaintKit } from './paint-kit';

const BASE_SPACING = 32;
/** Khoảng cách lưới nhỏ nhất trên MÀN HÌNH (px): zoom xa thì gấp đôi bước lưới cho tới khi ≥ ngưỡng này — lưới dày đặc chỉ là nhiễu. */
const MIN_SCREEN_SPACING = 14;
/** Trần số đường/chấm mỗi trục — chặn lưới làm phình số lệnh vẽ khi vùng dựng cảnh rất lớn. */
const MAX_LINES = 160;

/** Bước lưới (đơn vị thế giới) hợp với mức zoom: 32, 64, 128… sao cho bước trên màn ≥ 14 px. */
export function gridSpacing(zoom: number): number {
  let spacing = BASE_SPACING;
  while (spacing * zoom < MIN_SCREEN_SPACING) spacing *= 2;
  return spacing;
}

/** Toạ độ các đường lưới cắt `rect`; nới bước lưới nếu vượt `MAX_LINES` (hàm thuần — test bằng số, không cần Skia). */
export function gridLines(rect: Rect, zoom: number): { spacing: number; xs: number[]; ys: number[] } {
  let spacing = gridSpacing(zoom);
  while (Math.max(rect.w, rect.h) / spacing > MAX_LINES) spacing *= 2;
  const axis = (start: number, length: number): number[] => {
    const out: number[] = [];
    for (let v = Math.ceil(start / spacing) * spacing; v <= start + length; v += spacing) out.push(v);
    return out;
  };
  return { spacing, xs: axis(rect.x, rect.w), ys: axis(rect.y, rect.h) };
}

/**
 * Nền lưới/chấm (`meta.background`) cho vùng `rect`, vẽ TRONG cảnh (toạ độ thế giới) để pan/zoom chỉ là đổi ma trận, không dựng lại. Độ dày
 * nét `1/zoom` giữ đường lưới luôn ~1 px trên màn. `plain` không vẽ gì.
 */
export function paintBackground(
  canvas: SkCanvas,
  kit: PaintKit,
  kind: BackgroundKind,
  rect: Rect,
  zoom: number,
): void {
  if (kind === 'plain') return;
  const { xs, ys } = gridLines(rect, zoom);
  const hex = kit.colors['border-1'];
  if (kind === 'grid') {
    const paint = kit.strokeHex(hex, 1 / zoom);
    for (const x of xs) canvas.drawLine(x, rect.y, x, rect.y + rect.h, paint);
    for (const y of ys) canvas.drawLine(rect.x, y, rect.x + rect.w, y, paint);
    return;
  }
  const dots = xs.flatMap((x) => ys.map((y) => ({ x, y })));
  canvas.drawPoints(kit.skia.PointMode.Points, dots, kit.strokeHex(hex, 2.5 / zoom));
}
