import { useEffect } from 'react';
import { Gesture } from 'react-native-gesture-handler';
import {
  clamp,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { MOTION_SPRING } from '@/shared/ui/motion';

/** Khung tự xem ≈ 96×128dp (`w-24 h-32`) — cùng tỉ lệ dọc 3:4 với camera trước của điện thoại. */
export const PIP_SIZE = { height: 128, width: 96 } as const;

/** Góc đang đậu: bit `LEFT` / `TOP` (0 = dưới-phải — chỗ mặc định, xa tên người kia ở dưới-trái nhất). */
const LEFT = 1;
const TOP = 2;
/** "Ném" khung: lấy điểm rơi dự kiến sau ngần này giây theo vận tốc cuối rồi mới chọn góc — vuốt nhanh về phía nào là sang góc đó. */
const FLING_PROJECTION_S = 0.12;

export interface PipBounds {
  /** Kích thước khung chứa (vùng sân khấu), dp. */
  height: number;
  width: number;
}

/**
 * Kéo khung tự xem (PiP) và thả để nó HÍT vào góc gần nhất — kiểu Google Meet/FaceTime cho cuộc 1:1.
 *
 * Toạ độ là ĐỘ LỆCH so với chỗ neo dưới-phải (`x`, `y` ≤ 0): khung hình đầu tiên — chưa đo xong vùng sân khấu — vẫn nằm đúng góc dưới-phải,
 * không loé ở toạ độ (0, 0). Kéo bị KẸP trong vùng sân khấu (trừ lề `margin`), thả ra thì về góc theo điểm rơi dự kiến. Vùng sân khấu đổi
 * (xoay máy, thanh điều khiển ẩn/hiện) ⇒ khung giữ GÓC đang đậu, tính lại toạ độ.
 *
 * ✅ "Giảm chuyển động" ⇒ nhảy thẳng vào góc, không lò xo. ⚠️ Shared value đọc/ghi bằng `get()`/`set()` (luật `react-hooks/immutability`
 * của React Compiler). ⚠️ Chưa thử trên máy thật (Jest chỉ có bản giả của gesture-handler).
 */
export function usePipDrag(bounds: PipBounds, margin: number) {
  const reduceMotion = useReducedMotion();
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const corner = useSharedValue(0);
  const rangeX = Math.max(0, bounds.width - PIP_SIZE.width - 2 * margin);
  const rangeY = Math.max(0, bounds.height - PIP_SIZE.height - 2 * margin);

  useEffect(() => {
    const at = corner.get();
    x.set(at & LEFT ? -rangeX : 0);
    y.set(at & TOP ? -rangeY : 0);
  }, [corner, rangeX, rangeY, x, y]);

  const gesture = Gesture.Pan()
    .onStart(() => {
      startX.set(x.get());
      startY.set(y.get());
    })
    .onUpdate((event) => {
      x.set(clamp(startX.get() + event.translationX, -rangeX, 0));
      y.set(clamp(startY.get() + event.translationY, -rangeY, 0));
    })
    .onEnd((event) => {
      const left = x.get() + event.velocityX * FLING_PROJECTION_S < -rangeX / 2;
      const top = y.get() + event.velocityY * FLING_PROJECTION_S < -rangeY / 2;
      corner.set((left ? LEFT : 0) | (top ? TOP : 0));
      const toX = left ? -rangeX : 0;
      const toY = top ? -rangeY : 0;
      x.set(reduceMotion ? toX : withSpring(toX, MOTION_SPRING.settle));
      y.set(reduceMotion ? toY : withSpring(toY, MOTION_SPRING.settle));
    });

  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: x.get() }, { translateY: y.get() }],
  }));

  return { gesture, style };
}
