import { useEffect, type ReactNode } from 'react';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

const RISE_MS = 200;
/** Đi lên bấy nhiêu dp khi hiện (dp) — đủ để thấy "trồi lên", chưa đủ để giật mắt. */
const RISE_DISTANCE = 10;
const START_SCALE = 0.96;
const FILL = { flex: 1 } as const;

export interface RiseInProps {
  children: ReactNode;
  /** Chiếm hết chỗ của cha (thẻ) — mặc định ôm nội dung (hàng nút). */
  fill?: boolean;
}

/**
 * Khối "trồi lên + hiện dần" lúc XUẤT HIỆN (thẻ mới vào bộ bài, hàng nút đánh giá vừa lộ sau khi lật). Đúng MỘT lần mỗi lần gắn
 * vào cây — muốn chạy lại cho thẻ khác thì nơi dùng đặt `key` theo thẻ.
 *
 * Vì sao tự dựng mà không dùng `entering={FadeInDown}`: hiệu ứng vào phải KHỚP với tư thế của lớp "thẻ kế lấp ló" phía sau
 * (`PeekLayer`) và tắt sạch khi "Giảm chuyển động" — `useReducedMotion()` bật ⇒ hiện ngay, không mờ, không trượt. Chuyển động
 * ở đây chỉ dẫn mắt, không mang thông tin.
 *
 * ⛔ `Animated.View` KHÔNG mang `className` (NativeWind + `useAnimatedStyle` làm rơi style) — nơi dùng đặt class ở `View` lồng bên trong.
 */
export function RiseIn({ children, fill = false }: RiseInProps) {
  const reduceMotion = useReducedMotion();
  const progress = useSharedValue(reduceMotion ? 1 : 0);

  useEffect(() => {
    if (!reduceMotion) {
      progress.set(withTiming(1, { duration: RISE_MS, easing: Easing.out(Easing.cubic) }));
    }
  }, [progress, reduceMotion]);

  const style = useAnimatedStyle(() => {
    const value = progress.get();
    return {
      opacity: value,
      transform: [
        { translateY: (1 - value) * RISE_DISTANCE },
        { scale: START_SCALE + (1 - START_SCALE) * value },
      ],
    };
  });

  // ⚠️ Interop đăng ký toàn cục vẫn gộp style dù không có className, làm mất flex: 1 và co thẻ về 0.
  return (
    <Animated.View cssInterop={false} style={[fill ? FILL : null, style]}>
      {children}
    </Animated.View>
  );
}
