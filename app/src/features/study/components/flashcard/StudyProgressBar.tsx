import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import type { IconTileTone } from '@/shared/ui/icon-tile';
import { cn } from '@/shared/utils/style/cn';

import { TONE_FILL, TRACK_CLASS } from './study-tone.constants';

const FILL_MS = 320;
const FULL_HEIGHT = { height: '100%' } as const;

export interface StudyProgressBarProps {
  /** 0..100. */
  percent: number;
  tone: IconTileTone;
}

/**
 * Thanh tiến độ mảnh (8dp) cho phiên thẻ: phần đã chạy nhuộm theo tông chế độ và TRƯỢT tới mức mới (320 ms, luồng UI — không
 * `setState` mỗi khung hình). "Giảm chuyển động" ⇒ nhảy thẳng tới mức mới.
 *
 * Chỉ là HÌNH: số "3/20" ở chữ ngay trên mới là thông tin, nên cả thanh ẩn khỏi trình đọc màn hình (khỏi đọc hai lần).
 * ⛔ `Animated.View` không mang `className`; phần nhìn thấy là `View` lồng bên trong (`width`/`height` phải nằm TRONG style hoạt hoạ).
 */
export function StudyProgressBar({ percent, tone }: StudyProgressBarProps) {
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
      className={cn('h-2 overflow-hidden rounded-full', TRACK_CLASS)}
      importantForAccessibility="no-hide-descendants"
    >
      <Animated.View cssInterop={false} style={[FULL_HEIGHT, fillStyle]}>
        <View className={cn('flex-1 rounded-full', TONE_FILL[tone])} />
      </Animated.View>
    </View>
  );
}
