import {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { MOTION_SPRING, PRESS_SCALE } from './motion.tokens';

/**
 * Lõi "co nhẹ khi nhấn, bật về bằng lò xo" — dùng chung cho `PressableScale`, `Button` và control tự dựng (ô đáp án, ô lưới).
 *
 * ```tsx
 * const press = usePressScale();
 * <Pressable onPressIn={press.pressIn} onPressOut={press.pressOut}>
 *   <Animated.View style={press.scaleStyle}>
 *     <View className="rounded-md bg-bg-1 p-sm">…</View>
 *   </Animated.View>
 * </Pressable>
 * ```
 *
 * ⛔ `scaleStyle` là HANDLE của `useAnimatedStyle` ⇒ thẻ nhận nó KHÔNG được mang `className` (NativeWind + Reanimated vứt sạch
 * style của class, khối vô hình — `src/shared/ui/AGENTS.md`). Hình thức đặt ở `View` lồng bên trong.
 * ⚠️ "Giảm chuyển động" bật ⇒ không co; `pressOut` vẫn luôn trả về 1 (phòng khi cờ vừa bật giữa lúc đang giữ ngón tay).
 * ⚠️ `get()`/`set()` thay cho `.value` — dạng Reanimated 4 khuyên dùng, bộ luật React Compiler (`react-hooks/*`) không coi là ghi bậy.
 */
export function usePressScale(scaleTo: number = PRESS_SCALE) {
  const reduceMotion = useReducedMotion();
  const scale = useSharedValue(1);
  const scaleStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));

  const pressIn = () => {
    if (!reduceMotion) scale.set(withSpring(scaleTo, MOTION_SPRING.press));
  };

  const pressOut = () => {
    scale.set(withSpring(1, MOTION_SPRING.press));
  };

  return { pressIn, pressOut, scaleStyle };
}
