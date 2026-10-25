import { useEffect, useState, type ReactNode } from 'react';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

/** Đủ để mắt thấy câu mới "trượt vào", chưa đủ để người làm bài phải chờ trước khi đọc. */
const DURATION_MS = 220;
/** Quãng trượt ngang (dp): nhỏ — đây là gợi ý chiều đi, không phải màn trình diễn. */
const SLIDE_DP = 16;

/**
 * Câu mới mờ dần vào và trượt nhẹ từ phía chuyển tới (tiến → từ phải, lùi → từ trái). Giảm chuyển động của hệ điều hành
 * BẬT ⇒ đổi câu NGAY, không mờ, không trượt (app.md p4-02 §7).
 *
 * ⛔ `Animated.View` KHÔNG mang `className` (NativeWind + Reanimated làm rơi style — xem `shared/ui/AGENTS.md`): lớp này
 * chỉ mang `style` animation, phần nhìn thấy nằm trong `children`. Nơi gọi chỉ cần truyền `index` của câu đang xem.
 *
 * ⚠️ Chiều đi giữ trong state (mẫu "điều chỉnh state khi prop đổi") chứ không phải `useRef`: React Compiler cấm đọc ref
 * lúc render.
 */
export function QuestionTransition({ children, index }: { children: ReactNode; index: number }) {
  const reduceMotion = useReducedMotion();
  const progress = useSharedValue(reduceMotion ? 1 : 0);
  const [seen, setSeen] = useState(index);
  const [direction, setDirection] = useState(1);

  if (seen !== index) {
    setDirection(index > seen ? 1 : -1);
    setSeen(index);
  }

  useEffect(() => {
    if (reduceMotion) {
      progress.set(1);
      return;
    }
    progress.set(0);
    progress.set(withTiming(1, { duration: DURATION_MS, easing: Easing.out(Easing.cubic) }));
  }, [index, progress, reduceMotion]);

  const style = useAnimatedStyle(() => {
    const value = progress.get();
    return { opacity: value, transform: [{ translateX: (1 - value) * SLIDE_DP * direction }] };
  }, [direction]);

  return <Animated.View style={style}>{children}</Animated.View>;
}
