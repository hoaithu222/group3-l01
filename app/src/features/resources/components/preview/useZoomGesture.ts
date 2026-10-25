import { Gesture } from 'react-native-gesture-handler';
import { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

const MIN_SCALE = 1;
const MAX_SCALE = 5;
const DOUBLE_TAP_SCALE = 2.5;

/**
 * Pinch + kéo + chạm đúp để phóng ảnh (app.md p3-01 §3 "pinch/double-tap zoom").
 *
 * Kéo chỉ có tác dụng khi đã phóng (`scale > 1`) và bị KẸP trong phần ảnh thừa
 * ra ngoài khung — không kẹp thì kéo mạnh đẩy ảnh trôi khỏi màn và người dùng
 * không biết đường kéo lại (`onLayout` báo kích thước khung để tính ranh giới).
 * Chạm đúp: 1× ↔ 2,5×. `Exclusive`: chạm đúp ưu tiên, nếu không thì pinch+kéo
 * chạy song song.
 *
 * ⚠️ Chỉ trả `style` cho `Animated.View` — ⛔ `className` không đi chung với
 * `Animated.*` (xem `shared/ui/AGENTS.md` mục "Chuyển động").
 */
export function useZoomGesture() {
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

  const gesture = Gesture.Exclusive(doubleTap, Gesture.Simultaneous(pinch, pan));
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
