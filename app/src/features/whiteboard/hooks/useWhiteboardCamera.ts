import { useCallback, useEffect, useRef, useState } from 'react';
import {
  useDerivedValue,
  useSharedValue,
  type DerivedValue,
  type SharedValue,
} from 'react-native-reanimated';

import {
  INITIAL_CAMERA,
  inflateRect,
  rectContainsRect,
  visibleWorldRect,
  type Camera,
  type Rect,
} from '../engine';
import { loadViewport, saveViewport } from '../store/whiteboard-prefs';

export interface ViewSize {
  height: number;
  width: number;
}

/** Vùng thế giới đã dựng vào cảnh + zoom lúc dựng; `null` khi chưa biết kích thước khung nhìn. */
export interface RenderView {
  rect: Rect;
  zoom: number;
}

/** Lề dựng thêm quanh khung nhìn (tỉ lệ theo cạnh dài): pan tới đâu vẫn có nội dung sẵn trong cảnh, không phải dựng lại giữa lúc kéo. */
const MARGIN = 0.75;
/** Vùng dựng lớn hơn khung nhìn quá bấy nhiêu lần (đã zoom vào nhiều) thì dựng lại — không thì vẽ dư hàng nghìn phần tử ngoài màn. */
const OVERSIZE = 8;
/** Zoom lệch quá tỉ lệ này so với lúc dựng thì dựng lại (đường lưới/độ dày nét phụ thuộc zoom). */
const ZOOM_DRIFT = 1.6;

/** Có cần dựng lại cảnh cho camera `cam` không — hàm thuần, test bằng số. */
export function needsRerender(view: RenderView | null, cam: Camera, size: ViewSize): boolean {
  if (!view || size.width <= 0 || size.height <= 0) return true;
  const visible = visibleWorldRect(cam, size);
  const ratio = cam.zoom / view.zoom;
  return (
    !rectContainsRect(view.rect, visible) ||
    view.rect.w > visible.w * OVERSIZE ||
    ratio > ZOOM_DRIFT ||
    ratio < 1 / ZOOM_DRIFT
  );
}

export function renderViewFor(cam: Camera, size: ViewSize): RenderView {
  const visible = visibleWorldRect(cam, size);
  return { rect: inflateRect(visible, Math.max(visible.w, visible.h) * MARGIN), zoom: cam.zoom };
}

/** Ma trận camera cho `Group.transform` của Skia: `màn hình = thế giới × zoom + (x, y)` ⇒ tịnh tiến rồi co giãn. */
export type CameraTransform = ({ translateX: number } | { translateY: number } | { scale: number })[];

export interface WhiteboardCamera {
  /** Đọc camera hiện tại (KHÔNG gọi lúc render — shared value đổi ngoài React). */
  get: () => Camera;
  /** Đã khôi phục viewport từ đĩa — khi đó KHÔNG tự "vừa khít" lúc đồng bộ lần đầu (người dùng đã có góc nhìn riêng). */
  hasSavedViewport: () => boolean;
  onLayout: (size: ViewSize) => void;
  /** Cuối cử chỉ/đổi camera bằng mã: dựng lại cảnh nếu cần + lưu viewport. */
  settle: () => void;
  set: (camera: Camera) => void;
  /** Zoom ở lần lắng gần nhất (state React) — lớp phủ/con trỏ chia cho nó để giữ cỡ cố định theo px màn. */
  settledZoom: number;
  size: () => ViewSize;
  transform: DerivedValue<CameraTransform>;
  view: RenderView | null;
  zoom: SharedValue<number>;
}

/**
 * Camera của canvas vô cực (app.md §3): `x`,`y`,`zoom` là SHARED VALUE của Reanimated — cử chỉ ghi vào chúng và Skia đọc qua `useDerivedValue` trên UI
 * thread, nên pan/zoom KHÔNG đi qua React state (đổi 60 lần/giây; để trong state là vẽ lại cả cây mỗi frame). React chỉ biết camera ở các điểm
 * "lắng" (`settle`, cuối cử chỉ): lúc đó quyết có dựng lại cảnh không (`needsRerender`) và lưu viewport theo người dùng + bảng (AsyncStorage `u:<userId>:wb.viewport.<wbId>`).
 */
export function useWhiteboardCamera(wbId: string, userId: string | undefined): WhiteboardCamera {
  const x = useSharedValue(INITIAL_CAMERA.x);
  const y = useSharedValue(INITIAL_CAMERA.y);
  const zoom = useSharedValue(INITIAL_CAMERA.zoom);
  const size = useRef<ViewSize>({ height: 0, width: 0 });
  /** Camera đã bị người dùng đổi (hoặc khôi phục từ đĩa) — chỉ khi đó mới ghi đĩa lúc rời, không thì ghi đè viewport đã lưu bằng camera mặc định. */
  const dirty = useRef(false);
  const restored = useRef(false);
  const [view, setView] = useState<RenderView | null>(null);
  const [settledZoom, setSettledZoom] = useState(INITIAL_CAMERA.zoom);
  const transform = useDerivedValue(() => [
    { translateX: x.value },
    { translateY: y.value },
    { scale: zoom.value },
  ]);

  // `.get()`/`.set()` (Reanimated 4) thay cho `.value`: React Compiler coi giá trị trả từ hook là bất biến nên `x.value = …` trong `useCallback` bị chặn (`react-hooks/immutability`).
  const get = useCallback((): Camera => ({ x: x.get(), y: y.get(), zoom: zoom.get() }), [x, y, zoom]);
  const set = useCallback(
    (camera: Camera) => {
      x.set(camera.x);
      y.set(camera.y);
      zoom.set(camera.zoom);
    },
    [x, y, zoom],
  );
  const recalc = useCallback(() => {
    const cam = get();
    setSettledZoom(cam.zoom);
    setView((prev) => (needsRerender(prev, cam, size.current) ? renderViewFor(cam, size.current) : prev));
  }, [get]);
  const settle = useCallback(() => {
    dirty.current = true;
    recalc();
  }, [recalc]);
  const onLayout = useCallback(
    (next: ViewSize) => {
      size.current = next;
      recalc();
    },
    [recalc],
  );

  // Khôi phục viewport đã lưu của bảng này (nếu có) rồi mở; lưu lại khi rời màn. Đọc đĩa bất đồng bộ nên camera mặc định hiện trước một nhịp.
  useEffect(() => {
    let cancelled = false;
    void loadViewport(userId, wbId).then((saved) => {
      if (cancelled || !saved) return;
      restored.current = true;
      set(saved);
      settle();
    });
    return () => {
      cancelled = true;
      if (dirty.current) saveViewport(userId, wbId, get());
    };
  }, [get, set, settle, userId, wbId]);

  return { get, hasSavedViewport: () => restored.current, onLayout, set, settle, settledZoom, size: () => size.current, transform, view, zoom };
}
