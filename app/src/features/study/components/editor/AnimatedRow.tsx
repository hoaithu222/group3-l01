import { cssInterop } from 'nativewind';
import type { ReactNode } from 'react';
import Animated, { FadeInDown, FadeOut, useReducedMotion } from 'react-native-reanimated';

/**
 * ⛔ BẮT BUỘC: `Animated.View` không nằm trong danh sách interop sẵn của NativeWind — thiếu dòng này thì `className` bị bỏ qua ÂM
 * THẦM (cùng lý do `Skeleton`, `EnterView`). ⚠️ Chỉ đủ vì ở đây KHÔNG có `useAnimatedStyle`: hiệu ứng là prop `entering`/`exiting`
 * (layout animation), không phải handle style — trộn handle với `className` mới làm vô hình cả khối (xem `shared/ui/AGENTS.md`).
 */
const AnimatedView = cssInterop(Animated.View, { className: 'style' });

const ENTER_MS = 180;
const EXIT_MS = 120;

export interface AnimatedRowProps {
  /** Tắt hiệu ứng cho hàng CÓ SẴN lúc mở form — chỉ hàng mới thêm mới "hiện dần" (mở form không được chớp cả danh sách). */
  animate?: boolean;
  children: ReactNode;
  className?: string;
  /** Hiệu ứng thoát chỉ đúng khi hàng có khoá ỔN ĐỊNH; hàng khoá theo chỉ số (đáp án điền chỗ trống) thì tắt kẻo mờ nhầm hàng cuối. */
  exit?: boolean;
}

/**
 * Hàng có thể thêm/xoá trong form (lựa chọn trắc nghiệm, đáp án điền chỗ trống): hiện dần + trượt nhẹ khi thêm, mờ dần khi xoá.
 * ⛔ Tôn trọng "Giảm chuyển động": `useReducedMotion()` bật ⇒ KHÔNG truyền `entering`/`exiting` — hàng vào/ra ngay lập tức. Chuyển động
 * ở đây chỉ dẫn mắt tới chỗ vừa đổi, không mang thông tin nên bỏ đi không mất gì.
 */
export function AnimatedRow({
  animate = true,
  children,
  className,
  exit = true,
}: AnimatedRowProps) {
  const reduceMotion = useReducedMotion();
  const enabled = !reduceMotion;
  return (
    <AnimatedView
      className={className}
      entering={enabled && animate ? FadeInDown.duration(ENTER_MS) : undefined}
      exiting={enabled && exit ? FadeOut.duration(EXIT_MS) : undefined}
    >
      {children}
    </AnimatedView>
  );
}
