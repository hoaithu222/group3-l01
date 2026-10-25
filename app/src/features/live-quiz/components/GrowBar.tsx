import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { cn } from '@/shared/utils/style/cn';

const GROW_MS = 420;
const FULL_HEIGHT = { height: '100%' } as const;

export interface GrowBarProps {
  /** Lớp MÀU của phần đã đầy (`bg-action-success`…). */
  fillClassName: string;
  /** 0..100. */
  percent: number;
  className?: string;
}

/**
 * Thanh tỉ lệ mảnh (8dp) — phần đầy TRƯỢT từ 0 tới `percent` lúc hiện và tới mức mới khi số đổi (luồng UI, không `setState`
 * mỗi khung hình). "Giảm chuyển động" ⇒ nhảy thẳng tới mức đích. Chỉ là HÌNH: con số đã nằm ở chữ đứng cạnh nên cả thanh ẩn khỏi
 * trình đọc màn hình (khỏi đọc hai lần). Vì sao không dùng `Progress` chung: đó là dòng thời gian trạng thái theo chiều dọc,
 * không phải thanh tỉ lệ ngang. ⛔ `Animated.View` không mang `className` — phần nhìn thấy là `View` lồng bên trong.
 */
export function GrowBar({ className, fillClassName, percent }: GrowBarProps) {
  const reduceMotion = useReducedMotion();
  const target = Math.max(0, Math.min(100, percent));
  const value = useSharedValue(reduceMotion ? target : 0);

  useEffect(() => {
    value.set(
      reduceMotion
        ? target
        : withTiming(target, { duration: GROW_MS, easing: Easing.out(Easing.cubic) }),
    );
  }, [reduceMotion, target, value]);

  const fillStyle = useAnimatedStyle(() => ({ width: `${value.get()}%` }));

  return (
    <View
      accessibilityElementsHidden
      className={cn('h-2 overflow-hidden rounded-full bg-bg-4', className)}
      importantForAccessibility="no-hide-descendants"
    >
      <Animated.View cssInterop={false} style={[FULL_HEIGHT, fillStyle]}>
        <View className={cn('flex-1 rounded-full', fillClassName)} />
      </Animated.View>
    </View>
  );
}
