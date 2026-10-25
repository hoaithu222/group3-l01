import { useMemo } from 'react';
import { Gesture } from 'react-native-gesture-handler';

import { panBy, pinchCamera, screenToWorld, type Camera, type Vec2 } from '../engine';
import type { DragSession, Interaction } from '../canvas/interaction/interaction.types';
import type { WhiteboardCamera } from './useWhiteboardCamera';

/** Kéo ngắn hơn ngưỡng này (px) chưa coi là kéo — chạm nhẹ không bị hiểu thành nét dài 1 px hay khung chọn. */
const DRAG_MIN_DISTANCE = 6;
const LONG_PRESS_MS = 450;
const TAP_MAX_DISTANCE = 10;

interface GestureState {
  base: Camera;
  down: Vec2;
  focal: Vec2;
  interaction: Interaction | null;
  panned: boolean;
  pinching: boolean;
  session: DragSession | null;
}

/**
 * Cử chỉ của canvas (README app.md §3). GestureDetector + Gesture Handler; MỌI callback chạy trên JS thread (`runOnJS(true)`) vì phải gọi hàm engine
 * (không phải worklet) và ghi Y.Doc — camera vẫn mượt vì canvas đọc camera từ shared value trên UI thread, JS chỉ GHI giá trị (nhẹ). Đánh đổi: khi JS
 * bận (dựng lại cảnh 5000 phần tử) cử chỉ có thể trễ một nhịp — chưa đo trên máy thật (WB-04).
 *
 *  · 2 ngón (kéo/chụm): pan + zoom quanh tâm hai ngón, luôn bật, KHÔNG tạo thay đổi CRDT. Zoom tính từ camera LÚC BẮT ĐẦU (`pinchCamera`), pan cộng dồn
 *    `changeX/Y` để nối tiếp được sau khi chụm kết thúc mà không nhảy.
 *  · 1 ngón kéo: nếu có `interaction` (CÓ quyền vẽ) → phiên kéo theo công cụ; công cụ không kéo được (chữ/giấy nhớ) hoặc không có `interaction`
 *    (người xem/bảng lưu trữ) → pan camera.
 *  · Chạm / nhấn giữ: chỉ khi có `interaction`.
 * ⚠️ Ngón thứ hai chạm vào giữa lúc đang vẽ làm cử chỉ 1 ngón bị huỷ (`maxPointers(1)`) → `onFinalize` với `success = false` → bỏ nét đang vẽ.
 */
export function useWhiteboardGestures(
  camera: Pick<WhiteboardCamera, 'get' | 'set' | 'settle'>,
  makeInteraction: (() => Interaction) | null,
) {
  const { get, set, settle } = camera;
  // ⚠️ Trạng thái cử chỉ tạo NGAY TRONG `useMemo` (không phải `useRef`): đọc `ref.current` lúc render bị `react-hooks/refs` chặn, và nó cũng chỉ cần sống
  // cùng bộ cử chỉ — dựng lại bộ cử chỉ (đổi quyền vẽ) là bắt đầu lại từ trạng thái sạch, đúng ý.
  return useMemo(() => {
    // Bộ xử lý tương tác dựng LƯỜI ở cử chỉ đầu tiên (không phải lúc render — nó đọc ref của màn qua `InteractionEnv`).
    const s: GestureState = {
      base: { x: 0, y: 0, zoom: 1 },
      down: { x: 0, y: 0 },
      focal: { x: 0, y: 0 },
      interaction: null,
      panned: false,
      pinching: false,
      session: null,
    };
    const interaction = (): Interaction | null => {
      if (!s.interaction && makeInteraction) s.interaction = makeInteraction();
      return s.interaction;
    };
    const pinch = Gesture.Pinch()
      .runOnJS(true)
      .onStart((e) => {
        s.pinching = true;
        s.base = get();
        s.focal = { x: e.focalX, y: e.focalY };
      })
      .onUpdate((e) => set(pinchCamera(s.base, s.focal, 1, { x: e.focalX, y: e.focalY }, e.scale)))
      .onFinalize(() => {
        s.pinching = false;
        settle();
      });

    const twoFingerPan = Gesture.Pan()
      .runOnJS(true)
      .minPointers(2)
      .maxPointers(2)
      .onChange((e) => {
        if (!s.pinching) set(panBy(get(), e.changeX, e.changeY));
      })
      .onFinalize(() => settle());

    const drag = Gesture.Pan()
      .runOnJS(true)
      .maxPointers(1)
      .minDistance(DRAG_MIN_DISTANCE)
      .onBegin((e) => {
        s.down = { x: e.x, y: e.y };
      })
      .onStart((e) => {
        s.session = interaction()?.begin(s.down) ?? null;
        // Phiên bắt đầu ở điểm CHẠM XUỐNG; dồn ngay tới vị trí hiện tại để không mất quãng đã kéo qua ngưỡng nhúc nhích.
        if (s.session) s.session.move(screenToWorld(get(), { x: e.x, y: e.y }));
      })
      .onChange((e) => {
        if (s.session) s.session.move(screenToWorld(get(), { x: e.x, y: e.y }));
        else {
          s.panned = true;
          set(panBy(get(), e.changeX, e.changeY));
        }
      })
      .onFinalize((_e, success) => {
        const session = s.session;
        s.session = null;
        if (session) {
          if (success) session.end();
          else session.cancel();
        } else if (s.panned) settle();
        s.panned = false;
      });

    const tap = Gesture.Tap()
      .runOnJS(true)
      .maxDistance(TAP_MAX_DISTANCE)
      .onEnd((e, success) => {
        if (success) interaction()?.tap({ x: e.x, y: e.y });
      });

    const hold = Gesture.LongPress()
      .runOnJS(true)
      .minDuration(LONG_PRESS_MS)
      .maxDistance(TAP_MAX_DISTANCE)
      .onStart((e) => interaction()?.longPress({ x: e.x, y: e.y }));

    return Gesture.Simultaneous(pinch, twoFingerPan, Gesture.Race(drag, tap, hold));
  }, [get, set, settle, makeInteraction]);
}
