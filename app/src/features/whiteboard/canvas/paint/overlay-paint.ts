import {
  elementBox,
  handlePositions,
  rectCorners,
  type Rect,
  type WhiteboardElement,
} from '../../engine';
import { ROTATE_HANDLE_PX } from '../interaction/interaction.constants';
import type { Draft } from '../interaction/interaction.types';
import { selectionGeometry } from '../interaction/selection-geometry';
import type { SkCanvas } from '../skia-module';
import { paintElement } from './element-paint';
import type { PaintKit } from './paint-kit';

/** Bán kính vẽ tay nắm (px màn) — nhỏ hơn vùng bắt (`HANDLE_HIT_PX`): trông gọn mà ngón tay vẫn trúng. */
const HANDLE_DRAW_PX = 7;

export interface OverlayInput {
  draft: Draft | null;
  /** Vẽ tay nắm (chỉ khi có quyền vẽ và không đang kéo). */
  handles: boolean;
  selected: readonly WhiteboardElement[];
  zoom: number;
}

function outline(canvas: SkCanvas, kit: PaintKit, box: Rect, rotation: number, zoom: number): void {
  const [a, b, c, d] = rectCorners(box, rotation);
  if (!a || !b || !c || !d) return;
  const paint = kit.strokeHex(kit.colors['border-brand'], 1.5 / zoom);
  canvas.drawLine(a.x, a.y, b.x, b.y, paint);
  canvas.drawLine(b.x, b.y, c.x, c.y, paint);
  canvas.drawLine(c.x, c.y, d.x, d.y, paint);
  canvas.drawLine(d.x, d.y, a.x, a.y, paint);
}

function handle(canvas: SkCanvas, kit: PaintKit, at: { x: number; y: number }, zoom: number): void {
  const r = HANDLE_DRAW_PX / zoom;
  canvas.drawCircle(at.x, at.y, r, kit.fillHex(kit.colors['bg-1']));
  canvas.drawCircle(at.x, at.y, r, kit.strokeHex(kit.colors['border-brand'], 1.5 / zoom));
}

/**
 * Lớp phủ tương tác (vẽ trong toạ độ THẾ GIỚI; kích thước cố định theo px màn nên chia `zoom`): bản nháp đang kéo, khung chọn quanh từng phần tử,
 * hộp bao + tay nắm của vùng chọn, khung chọn nhiều. Đổi zoom thì nét/tay nắm lệch cỡ tới lần dựng lại kế (cuối cử chỉ) — chấp nhận, đổi lại pan/zoom
 * không phải dựng lại gì. Hình học khung chọn dùng CHUNG `selectionGeometry` với bộ xử lý cử chỉ nên tay nắm vẽ ra đúng chỗ tay nắm bắt được.
 */
export function paintOverlay(canvas: SkCanvas, kit: PaintKit, input: OverlayInput): void {
  const { draft, handles, selected, zoom } = input;
  for (const el of draft?.elements ?? []) paintElement(canvas, el, kit);
  const marquee = draft?.marquee;
  if (marquee) {
    canvas.drawRect(
      kit.skia.Skia.XYWHRect(marquee.x, marquee.y, marquee.w, marquee.h),
      kit.strokeHex(kit.colors['border-brand'], 1 / zoom),
    );
  }
  const geo = selectionGeometry(selected);
  if (!geo || draft?.active) return;
  for (const el of selected) {
    // Đường/mũi tên: chỉ có hai tay nắm đầu mút, hộp bao của chúng là nhiễu.
    if (el.type === 'line' || el.type === 'arrow') continue;
    const box = elementBox(el);
    outline(canvas, kit, box, el.rotation, zoom);
  }
  if (!handles) return;
  if (geo.kind === 'line') {
    handle(canvas, kit, geo.start, zoom);
    handle(canvas, kit, geo.end, zoom);
    return;
  }
  if (geo.kind === 'group') outline(canvas, kit, geo.box, 0, zoom);
  const positions = handlePositions(geo.box, geo.rotation, ROTATE_HANDLE_PX / zoom);
  for (const [id, at] of Object.entries(positions)) {
    if (id === 'rotate' && geo.kind === 'group') continue;
    handle(canvas, kit, at, zoom);
  }
}
