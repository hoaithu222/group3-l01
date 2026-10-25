import { useEffect } from 'react';
import { Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { Icon } from '@/shared/ui/icon';
import { cn } from '@/shared/utils/style/cn';

const POP_SCALE = 1.25;
const POP_MS = 110;

/**
 * Chuỗi đúng liên tiếp ("Chuỗi 3") ở đầu phiên. Mỗi lần chuỗi TĂNG, viên thuốc "bật" nhẹ (phóng ~1.25× rồi về bằng lò xo, ~0.3 s); chuỗi về 0
 * (trả lời sai) thì không có gì chuyển động — không chế giễu người học. "Giảm chuyển động" ⇒ không phóng, số vẫn đổi.
 * Icon + chữ, màu chỉ nhấn (viên `surface-secondary` khi đang có chuỗi, trung tính khi chuỗi 0). Nhãn trợ năng "Chuỗi đúng liên tiếp: 3"; không phải vùng
 * live riêng — thông báo chuỗi đi cùng phản hồi đúng/sai ở `QuizFeedbackBar` (khỏi đọc hai lần).
 *
 * ⛔ `Animated.View` không mang `className` (NativeWind + `useAnimatedStyle` làm rơi style): lớp animation chỉ mang `transform`, viên thuốc là `View` lồng trong.
 */
export function StreakBadge({ streak }: { streak: number }) {
  const reduceMotion = useReducedMotion();
  const scale = useSharedValue(1);

  useEffect(() => {
    if (streak < 1 || reduceMotion) return;
    scale.set(
      withSequence(
        withTiming(POP_SCALE, { duration: POP_MS }),
        withSpring(1, { damping: 9, stiffness: 220 }),
      ),
    );
  }, [reduceMotion, scale, streak]);

  const popStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
  const active = streak > 0;

  return (
    <Animated.View style={popStyle}>
      <View
        accessibilityLabel={`Chuỗi đúng liên tiếp: ${streak}`}
        accessible
        className={cn(
          'flex-row items-center gap-3xs rounded-full px-sm py-3xs',
          active ? 'bg-surface-secondary' : 'bg-surface-neutral',
        )}
      >
        <Icon
          color={active ? 'action-accent' : 'fg-2'}
          name="star"
          size={16}
          variant={active ? 'solid' : 'linear'}
        />
        <Text className="text-label-md text-fg-1" maxFontSizeMultiplier={1.3}>
          {`Chuỗi ${streak}`}
        </Text>
      </View>
    </Animated.View>
  );
}
