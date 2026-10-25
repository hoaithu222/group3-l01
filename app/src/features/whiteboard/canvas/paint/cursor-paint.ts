import { elementBox, type WhiteboardElement } from '../../engine';
import type { RemotePeer } from '../../collab/awareness-peers';
import type { SkCanvas } from '../skia-module';
import type { PaintKit } from './paint-kit';

const LABEL_FONT_PX = 12;
const LABEL_PAD = 5;

/**
 * Con trỏ + vùng chọn của NGƯỜI KHÁC (awareness `pointer`/`selection`, `collab/README.md` §3.3). Con trỏ kèm TÊN (không dùng màu làm tín hiệu duy
 * nhất — trợ năng). Vẽ trong "đơn vị màn hình": dời tới điểm con trỏ rồi `scale(1/zoom)` nên con trỏ luôn ~16 px dù zoom bao nhiêu. Vùng chọn của
 * người khác là khung màu của họ quanh phần tử (chỉ những phần tử còn tồn tại — id lạ bị bỏ qua, dữ liệu từ máy khác không đáng tin).
 */
export function paintCursors(
  canvas: SkCanvas,
  kit: PaintKit,
  peers: readonly RemotePeer[],
  byId: ReadonlyMap<string, WhiteboardElement>,
  zoom: number,
): void {
  const { Skia } = kit.skia;
  const font = kit.font(LABEL_FONT_PX);
  for (const peer of peers) {
    const hex = peer.color ?? kit.colors['fg-2'];
    for (const id of peer.selection) {
      const el = byId.get(id);
      if (!el) continue;
      const box = elementBox(el);
      canvas.drawRect(Skia.XYWHRect(box.x, box.y, box.w, box.h), kit.strokeHex(hex, 2 / zoom));
    }
    if (!peer.pointer) continue;
    canvas.save();
    canvas.translate(peer.pointer.x, peer.pointer.y);
    canvas.scale(1 / zoom, 1 / zoom);
    const arrow = Skia.Path.Make();
    arrow.moveTo(0, 0);
    arrow.lineTo(0, 16);
    arrow.lineTo(4.5, 12);
    arrow.lineTo(10, 12);
    arrow.close();
    canvas.drawPath(arrow, kit.fillHex(hex));
    canvas.drawPath(arrow, kit.strokeHex(kit.colors['bg-1'], 1));
    if (font) {
      const width = font.getTextWidth(peer.name);
      const label = Skia.XYWHRect(12, 16, width + LABEL_PAD * 2, LABEL_FONT_PX + LABEL_PAD);
      canvas.drawRect(label, kit.fillHex(hex));
      canvas.drawText(peer.name, 12 + LABEL_PAD, 16 + LABEL_FONT_PX, kit.fillHex(kit.colors['neutral-0']), font);
    }
    canvas.restore();
  }
}
