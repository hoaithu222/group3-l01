import { useEffect, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

const PULSE_MS = 1700;
const SPREAD = 0.7;
const PEAK_OPACITY = 0.45;

/**
 * Quầng tròn mờ toả ra rồi tan, lặp mãi quanh `children` — báo hiệu "đang chờ" (sảnh chờ). Chạy hoàn toàn trên luồng UI (một
 * `withRepeat`, không `setState`). "Giảm chuyển động" ⇒ KHÔNG có quầng (nội dung đứng yên): hiệu ứng này chỉ trang trí, dòng chữ
 * "chờ chủ phòng bắt đầu" đã nói đủ nghĩa. ⛔ `Animated.View` không mang `className`; phần nhìn thấy là `View` lồng trong.
 */
export function PulseHalo({ children }: { children: ReactNode }) {
  const reduceMotion = useReducedMotion();
  const spread = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) {
      spread.set(0);
      return undefined;
    }
    spread.set(
      withRepeat(withTiming(1, { duration: PULSE_MS, easing: Easing.out(Easing.quad) }), -1, false),
    );
    return () => spread.set(0);
  }, [reduceMotion, spread]);

  const haloStyle = useAnimatedStyle(() => ({
    opacity: (1 - spread.get()) * PEAK_OPACITY,
    transform: [{ scale: 1 + spread.get() * SPREAD }],
  }));

  return (
    <View className="items-center justify-center">
      {reduceMotion ? null : (
        <Animated.View
          cssInterop={false}
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, haloStyle]}
        >
          <View className="flex-1 rounded-full bg-action-warning" />
        </Animated.View>
      )}
      {children}
    </View>
  );
}
