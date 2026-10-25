import type { RemotePeer } from '../../collab/awareness-peers';
import { cullElements, type BackgroundKind, type Rect, type WhiteboardElement } from '../../engine';
import type { SkPicture } from '../skia-module';
import { paintBackground } from './background-paint';
import { paintCursors } from './cursor-paint';
import { paintElement } from './element-paint';
import { paintOverlay, type OverlayInput } from './overlay-paint';
import type { PaintKit } from './paint-kit';

/**
 * Cả ba lớp đều là `SkPicture` GHI MỘT LẦN rồi phát lại: pan/zoom chỉ đổi ma trận của `Group` (UI thread, không đụng JS), còn JS chỉ dựng lại
 * picture khi DỮ LIỆU đổi. Cắt (`bounds`) đặt rất lớn cố ý — bounds của `createPicture` là gợi ý loại bỏ, đặt sát vùng dựng thì phần nháp kéo ra ngoài
 * vùng đó có thể bị cắt mất; chi phí thật nằm ở số lệnh vẽ (đã lọc bằng `cullElements`), không ở bounds.
 */
const WORLD = { height: 2e7, width: 2e7, x: -1e7, y: -1e7 };

export interface SceneInput {
  background: BackgroundKind;
  elements: readonly WhiteboardElement[];
  /** Phần tử đang bị kéo/tẩy — bản gốc ẩn khỏi cảnh, bản nháp nằm ở lớp phủ. */
  hiddenIds: ReadonlySet<string>;
  /** Vùng THẾ GIỚI cần dựng: khung nhìn + lề. Phần tử ngoài vùng này không vào picture (culling). */
  renderRect: Rect;
  zoom: number;
}

const bounds = (kit: PaintKit) => kit.skia.Skia.XYWHRect(WORLD.x, WORLD.y, WORLD.width, WORLD.height);

/** Cảnh: nền + mọi phần tử GIAO vùng dựng, theo thứ tự z (dưới → trên). Đây là phần tốn kém nhất, chỉ chạy khi dữ liệu/vùng dựng đổi. */
export function recordScene(kit: PaintKit, input: SceneInput): SkPicture {
  return kit.skia.createPicture((canvas) => {
    paintBackground(canvas, kit, input.background, input.renderRect, input.zoom);
    for (const el of cullElements(input.elements, input.renderRect)) {
      if (!input.hiddenIds.has(el.id)) paintElement(canvas, el, kit);
    }
  }, bounds(kit));
}

export const recordOverlay = (kit: PaintKit, input: OverlayInput): SkPicture =>
  kit.skia.createPicture((canvas) => paintOverlay(canvas, kit, input), bounds(kit));

export const recordCursors = (
  kit: PaintKit,
  peers: readonly RemotePeer[],
  byId: ReadonlyMap<string, WhiteboardElement>,
  zoom: number,
): SkPicture =>
  kit.skia.createPicture((canvas) => paintCursors(canvas, kit, peers, byId, zoom), bounds(kit));
