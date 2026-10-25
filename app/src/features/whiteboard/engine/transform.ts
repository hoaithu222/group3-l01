import type { Rect, Vec2, WhiteboardElement } from './element.types';
import { elementBounds, inflateRect } from './geometry';
import { rectsIntersect } from './intersect';

/**
 * Camera của canvas vô cực: `màn hình = thế giới × zoom + (x, y)` — `(x, y)` là vị trí của GỐC thế giới trên màn
 * (pixel). Chọn dạng "tịnh tiến" chứ không phải "toạ độ thế giới ở góc trái-trên" vì nó khớp thẳng
 * `translate(x,y); scale(zoom)` của Skia và shared value của Reanimated (kế hoạch app.md §3).
 * Chính struct này lưu vào AsyncStorage `wb:viewport:{userId}:{wbId}`.
 */
export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

export const ZOOM_MIN = 0.1;
export const ZOOM_MAX = 4;
export const INITIAL_CAMERA: Camera = { x: 0, y: 0, zoom: 1 };

export const clampZoom = (zoom: number): number => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom));

export const worldToScreen = (cam: Camera, p: Vec2): Vec2 => ({
  x: p.x * cam.zoom + cam.x,
  y: p.y * cam.zoom + cam.y,
});

export const screenToWorld = (cam: Camera, p: Vec2): Vec2 => ({
  x: (p.x - cam.x) / cam.zoom,
  y: (p.y - cam.y) / cam.zoom,
});

/** Kéo bằng hai ngón / cuộn: chỉ dời camera, ⛔ không tạo thay đổi CRDT. */
export const panBy = (cam: Camera, dx: number, dy: number): Camera => ({
  ...cam,
  x: cam.x + dx,
  y: cam.y + dy,
});

/** Đặt zoom mới (bị kẹp 0.1×–4×) sao cho điểm thế giới đang nằm dưới `focal` (toạ độ màn) ĐỨNG YÊN. */
export function zoomTo(cam: Camera, zoom: number, focal: Vec2): Camera {
  const next = clampZoom(zoom);
  const world = screenToWorld(cam, focal);
  return { x: focal.x - world.x * next, y: focal.y - world.y * next, zoom: next };
}

export const zoomBy = (cam: Camera, factor: number, focal: Vec2): Camera =>
  zoomTo(cam, cam.zoom * factor, focal);

/**
 * Cử chỉ chụm 2 ngón, tính từ camera LÚC BẮT ĐẦU cử chỉ (không cộng dồn từng frame — cộng dồn làm sai số trôi
 * và zoom bị kẹp giữa chừng thì "nhớ" sai): zoom theo tỉ lệ khoảng cách hai ngón, và điểm thế giới dưới tâm hai
 * ngón lúc đầu đi theo tâm hai ngón hiện tại (vừa zoom vừa pan).
 */
export function pinchCamera(
  start: Camera,
  startFocal: Vec2,
  startSpan: number,
  focal: Vec2,
  span: number,
): Camera {
  const zoom = clampZoom(start.zoom * (startSpan > 0 ? span / startSpan : 1));
  const world = screenToWorld(start, startFocal);
  return { x: focal.x - world.x * zoom, y: focal.y - world.y * zoom, zoom };
}

/** Vùng thế giới đang hiện trong khung nhìn — để chỉ vẽ phần tử giao vùng này. */
export const visibleWorldRect = (cam: Camera, view: { width: number; height: number }): Rect => ({
  x: -cam.x / cam.zoom,
  y: -cam.y / cam.zoom,
  w: view.width / cam.zoom,
  h: view.height / cam.zoom,
});

/** Lọc phần tử giao khung nhìn (cộng nửa nét vẽ). Giữ nguyên thứ tự z. */
export function cullElements(
  elements: readonly WhiteboardElement[],
  world: Rect,
): WhiteboardElement[] {
  return elements.filter((el) =>
    rectsIntersect(inflateRect(elementBounds(el), el.strokeWidth / 2), world),
  );
}

/** Camera vừa khít `bounds` trong khung nhìn (zoom-to-fit). Không phóng quá `maxZoom` để bảng bé không bị to đùng. */
export function fitCamera(
  bounds: Rect | null,
  view: { width: number; height: number },
  padding = 48,
  maxZoom = 1,
): Camera {
  if (!bounds) return { ...INITIAL_CAMERA };
  const availW = Math.max(1, view.width - 2 * padding);
  const availH = Math.max(1, view.height - 2 * padding);
  const zoom = clampZoom(
    Math.min(maxZoom, availW / Math.max(bounds.w, 1), availH / Math.max(bounds.h, 1)),
  );
  return {
    x: view.width / 2 - (bounds.x + bounds.w / 2) * zoom,
    y: view.height / 2 - (bounds.y + bounds.h / 2) * zoom,
    zoom,
  };
}

/** Pixel màn → đơn vị thế giới (vùng chạm ~8 px không được co lại khi zoom-out). */
export const toWorldTolerance = (px: number, cam: Camera): number => px / cam.zoom;

/** Đọc lại camera từ JSON (AsyncStorage) — dữ liệu hỏng/cũ trả `null` chứ không ném, để mở bảng ở camera mặc định. */
export function parseCamera(raw: unknown): Camera | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const { x, y, zoom } = raw as Record<string, unknown>;
  if (typeof x !== 'number' || typeof y !== 'number' || typeof zoom !== 'number') return null;
  if (![x, y, zoom].every(Number.isFinite) || zoom <= 0) return null;
  return { x, y, zoom: clampZoom(zoom) };
}
