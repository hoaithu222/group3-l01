import { useEffect, useRef } from 'react';
import { View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { MOTION_DURATION, MOTION_EASING } from '../motion/motion.tokens';

/** Vị trí + bề rộng một tab trong hàng — lấy thẳng từ `onLayout` của tab (gốc toạ độ: mép trái của HÀNG). */
export interface TabLayout {
  width: number;
  x: number;
}

/**
 * Vạch chỉ báo của kiểu `underline` — MỘT vạch cho cả hàng, trượt (`translateX`) và co giãn (`width`) tới tab đang
 * chọn bằng `withTiming(MOTION_DURATION.base, MOTION_EASING.standard)`. Bản cũ vẽ một vạch RIÊNG trong từng tab nên đổi
 * tab là vạch biến mất chỗ này, bật ra chỗ kia.
 *
 * Vạch lấy màu NHẤN (nâu vàng), không phải màu thương hiệu — đúng bản vẽ, và nhờ khác màu chữ nên vạch vẫn thấy rõ trên
 * nền tối.
 *
 * ⚠️ Lần đo ĐẦU đặt thẳng vào chỗ (không trượt từ mép trái vào); "Giảm chuyển động" ⇒ luôn nhảy thẳng.
 * ⚠️ Nằm TRONG hàng tab (cùng gốc toạ độ với `onLayout` của từng tab) nên khi `scrollable` nó cuộn theo nội dung.
 * ⛔ Thẻ mang handle `useAnimatedStyle` KHÔNG mang `className` (`src/shared/ui/AGENTS.md`): vị trí ở `View` ngoài, màu ở
 * `View` trong. `collapsable={false}`: thẻ mang nền là thứ Android hay làm phẳng mất.
 */
export function TabsIndicator({ layout }: { layout: TabLayout | undefined }) {
  const reduceMotion = useReducedMotion();
  const x = useSharedValue(0);
  const width = useSharedValue(0);
  /** Đã đặt vạch vào chỗ lần nào chưa — lần đầu KHÔNG diễn. */
  const placed = useRef(false);

  useEffect(() => {
    if (!layout) return;
    if (!placed.current || reduceMotion) {
      placed.current = true;
      x.set(layout.x);
      width.set(layout.width);
      return;
    }
    const timing = { duration: MOTION_DURATION.base, easing: MOTION_EASING.standard };
    x.set(withTiming(layout.x, timing));
    width.set(withTiming(layout.width, timing));
  }, [layout, reduceMotion, width, x]);

  const slide = useAnimatedStyle(() => ({
    width: width.get(),
    transform: [{ translateX: x.get() }],
  }));

  return (
    <View
      accessibilityElementsHidden
      className="absolute inset-x-0 bottom-0"
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
    >
      <Animated.View style={slide}>
        <View className="h-0.5 bg-action-accent" collapsable={false} />
      </Animated.View>
    </View>
  );
}
