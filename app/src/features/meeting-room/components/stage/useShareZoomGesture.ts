import { Gesture } from 'react-native-gesture-handler';
import { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

const MIN_SCALE = 1;
const MAX_SCALE = 4;
/** Chạm đúp: 1× ↔ 2× (app.md p2-05 §3.2 `ZoomableShareView`). */
const DOUBLE_TAP_SCALE = 2;

/**
 * Cử chỉ của màn hình được chia sẻ: pinch phóng, kéo để xem phần khuất (CHỈ khi đã phóng), chạm đúp 1×↔2×, chạm đơn (tuỳ chọn) để
 * cha bật/tắt toàn màn hình.
 *
 * Kéo bị KẸP trong phần nội dung thừa ra ngoài khung (`onLayout` báo kích thước khung) — không kẹp thì kéo mạnh làm nội dung trôi khỏi màn
 * và người dùng không biết đường kéo lại. `Exclusive(chạm đúp, chạm đơn, pinch+kéo)`: chạm đơn phải đợi chạm đúp "thất bại" nên
 * chỉ kích hoạt sau ~250 ms; pinch/kéo chạy song song và chỉ bắt đầu khi đã nhúc nhích (chạm đơn hết hiệu lực).
 *
 * ⚠️ Chưa thử trên máy thật (Jest chỉ có bản giả của gesture-handler): cần kiểm pinch/kéo trên Android và iPad.
 * ⚠️ Chỉ trả `style` cho `Animated.View` — ⛔ `className` không đi chung với `Animated.*` (xem `shared/ui/AGENTS.md` mục "Chuyển động").
 */
export function useShareZoomGesture(onTap?: () => void) {
  const scale = useSharedValue(MIN_SCALE);
  const baseScale = useSharedValue(MIN_SCALE);
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const baseX = useSharedValue(0);
  const baseY = useSharedValue(0);
  const width = useSharedValue(0);
  const height = useSharedValue(0);

  const pinch = Gesture.Pinch()
    .onUpdate((event) => {
      scale.value = Math.min(MAX_SCALE, Math.max(MIN_SCALE, baseScale.value * event.scale));
    })
    .onEnd(() => {
      baseScale.value = scale.value;
      if (scale.value <= MIN_SCALE) {
        x.value = withTiming(0);
        y.value = withTiming(0);
        baseX.value = 0;
        baseY.value = 0;
      }
    });

  const pan = Gesture.Pan()
    .onUpdate((event) => {
      if (scale.value <= MIN_SCALE) return;
      const maxX = (width.value * (scale.value - 1)) / 2;
      const maxY = (height.value * (scale.value - 1)) / 2;
      x.value = Math.min(maxX, Math.max(-maxX, baseX.value + event.translationX));
      y.value = Math.min(maxY, Math.max(-maxY, baseY.value + event.translationY));
    })
    .onEnd(() => {
      baseX.value = x.value;
      baseY.value = y.value;
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      const zoomed = scale.value > MIN_SCALE;
      const next = zoomed ? MIN_SCALE : DOUBLE_TAP_SCALE;
      scale.value = withTiming(next);
      baseScale.value = next;
      if (zoomed) {
        x.value = withTiming(0);
        y.value = withTiming(0);
        baseX.value = 0;
        baseY.value = 0;
      }
    });

  const singleTap = Gesture.Tap()
    .numberOfTaps(1)
    .onEnd((_event, success) => {
      if (success && onTap) scheduleOnRN(onTap);
    });

  const gesture = Gesture.Exclusive(doubleTap, singleTap, Gesture.Simultaneous(pinch, pan));
  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }, { translateY: y.value }, { scale: scale.value }],
  }));

  return {
    gesture,
    onLayout: (size: { height: number; width: number }) => {
      width.value = size.width;
      height.value = size.height;
    },
    style,
  };
}
