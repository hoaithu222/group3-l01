import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { cancelAnimation, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import { Icon } from '@/shared/ui/icon';

/** Chậm và nhẹ: đây là màn CHỜ, không phải cảnh báo — nhịp nhanh sẽ gây lo lắng và tốn pin. */
const PULSE_DURATION_MS = 900;
const PULSE_MIN_OPACITY = 0.4;

export interface WaitingPulseProps {
  /** `true` ⇒ đứng yên (Giảm chuyển động của hệ điều hành, hoặc test — hoạt ảnh lặp vô hạn làm Jest không thoát). */
  still: boolean;
}

/**
 * Biểu tượng đồng hồ "thở" của màn chờ vào phòng. Độ mờ chạy qua `SharedValue` gắn THẲNG vào `style` của `Animated.View`; phần nhìn thấy
 * (đĩa tròn, nền) nằm ở `View className` bọc ngoài — `className` trên `Animated.*` bị NativeWind nuốt âm thầm (`shared/ui/AGENTS.md`).
 */
export function WaitingPulse({ still }: WaitingPulseProps) {
  const opacity = useSharedValue(1);

  useEffect(() => {
    if (still) {
      cancelAnimation(opacity);
      opacity.set(1);
      return undefined;
    }
    opacity.set(withRepeat(withTiming(PULSE_MIN_OPACITY, { duration: PULSE_DURATION_MS }), -1, true));
    return () => {
      cancelAnimation(opacity);
      opacity.set(1);
    };
  }, [still, opacity]);

  // Khung CÙNG hình với ô `IconTile xl` tông `info` của `StatusPage` (64dp, bo 24, nền `surface-info` + icon `info`) — màn chờ và màn
  // trạng thái khác chỉ khác nhau ở nhịp thở, không khác dáng.
  return (
    <View className="size-6xl items-center justify-center rounded-md bg-surface-info">
      <Animated.View style={{ opacity }}>
        <Icon color="info" name="clock" size="lg" variant="twotone" />
      </Animated.View>
    </View>
  );
}
