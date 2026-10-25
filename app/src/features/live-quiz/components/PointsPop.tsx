import { useEffect } from 'react';
import { Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSpring,
} from 'react-native-reanimated';

import { formatNumber } from '@/shared/utils/format/currency.utils';

const POP_DELAY_MS = 180;
const POP_SPRING = { damping: 10, stiffness: 170 } as const;

/**
 * "+120 điểm" nảy nhẹ vào lúc điểm câu vừa được cộng (lò xo trên luồng UI, trễ 180 ms để mắt kịp thấy dấu ✓ trước).
 * "Giảm chuyển động" ⇒ hiện ngay. Là TRANG TRÍ của con số đã có ở nhãn cả khối (`RevealVerdict` đọc "nhận thêm N điểm"),
 * nên bản thân chip ẩn khỏi trình đọc màn hình. ⛔ `Animated.View` không mang `className`.
 */
export function PointsPop({ points }: { points: number }) {
  const reduceMotion = useReducedMotion();
  const pop = useSharedValue(reduceMotion ? 1 : 0);

  useEffect(() => {
    if (!reduceMotion) pop.set(withDelay(POP_DELAY_MS, withSpring(1, POP_SPRING)));
  }, [pop, reduceMotion]);

  const style = useAnimatedStyle(() => ({
    opacity: Math.min(1, pop.get() * 1.4),
    transform: [{ translateY: (1 - pop.get()) * 10 }, { scale: 0.7 + 0.3 * pop.get() }],
  }));

  return (
    <Animated.View style={style}>
      <View
        accessibilityElementsHidden
        className="items-center rounded-md bg-action-success px-md py-xs"
        importantForAccessibility="no-hide-descendants"
      >
        <Text
          className="text-header-sm font-bold text-action-success-fg"
          maxFontSizeMultiplier={1.3}
        >
          {`+${formatNumber(points)}`}
        </Text>
        <Text className="text-label-xs text-action-success-fg" maxFontSizeMultiplier={1.3}>
          điểm
        </Text>
      </View>
    </Animated.View>
  );
}
