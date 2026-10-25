import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

const FILL_MS = 320;
const FULL_HEIGHT = { height: '100%' } as const;

/**
 * Thanh tiến độ mảnh (8dp) của Quiz nhanh: phần đã làm nhuộm tông `accent` của chế độ và TRƯỢT tới mức mới (luồng UI — không `setState` mỗi khung
 * hình). "Giảm chuyển động" ⇒ nhảy thẳng. Bộ chung chưa có thanh ngang (`Progress` là stepper dọc, `ProgressRing` là vòng).
 *
 * Chỉ là HÌNH: số "3 / 10" ở chữ ngay cạnh mới là thông tin, nên cả thanh ẩn khỏi trình đọc màn hình (khỏi đọc hai lần).
 * ⛔ `Animated.View` không mang `className`; phần nhìn thấy là `View` lồng bên trong (`height` nằm TRONG style hoạt hoạ).
 */
export function QuizProgressBar({ percent }: { percent: number }) {
  const reduceMotion = useReducedMotion();
  const value = useSharedValue(percent);

  useEffect(() => {
    value.set(
      reduceMotion
        ? percent
        : withTiming(percent, { duration: FILL_MS, easing: Easing.out(Easing.cubic) }),
    );
  }, [percent, reduceMotion, value]);

  const fillStyle = useAnimatedStyle(() => ({ width: `${value.get()}%` }));

  return (
    <View
      accessibilityElementsHidden
      className="h-2 overflow-hidden rounded-full bg-border-2"
      importantForAccessibility="no-hide-descendants"
    >
      <Animated.View cssInterop={false} style={[FULL_HEIGHT, fillStyle]}>
        <View className="flex-1 rounded-full bg-action-accent" />
      </Animated.View>
    </View>
  );
}
