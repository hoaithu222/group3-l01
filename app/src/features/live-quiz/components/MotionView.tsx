import { cssInterop } from 'nativewind';
import { type ReactNode } from 'react';
import Animated, {
  FadeIn,
  FadeInDown,
  LinearTransition,
  useReducedMotion,
  ZoomIn,
} from 'react-native-reanimated';

/**
 * ⛔ BẮT BUỘC: `Animated.View` không nằm trong danh sách interop sẵn của NativeWind — thiếu dòng này thì `className` bị bỏ qua ÂM
 * THẦM (cùng lý do `Skeleton`, `EnterView`). ⚠️ Chỉ đủ vì ở đây KHÔNG có `useAnimatedStyle`: `entering`/`layout` là layout
 * animation chứ không phải handle style — trộn handle với `className` mới làm vô hình cả khối (xem `shared/ui/AGENTS.md`).
 */
const AnimatedView = cssInterop(Animated.View, { className: 'style' });

/** Mỗi phần tử trễ thêm bấy nhiêu ms so với phần tử trước — đủ để mắt thấy "lần lượt hiện", chưa đủ để thấy chờ. */
const STAGGER_MS = 45;
/** Trần độ trễ: người thứ 9 trở đi không chờ lâu hơn người thứ 8 (phòng đông không được biến thành màn trình diễn). */
const MAX_STEPS = 8;
const ENTER_MS = 240;
const LAYOUT_MS = 260;

export type MotionEnter = 'fade' | 'rise' | 'zoom';

export interface MotionViewProps {
  children: ReactNode;
  /** Lớp BỐ CỤC của ô (`flex-1`, khung, nền) — animation không đụng vào. */
  className?: string;
  /** Kiểu xuất hiện: `rise` trượt lên + hiện dần · `zoom` nảy nhẹ từ nhỏ · `fade` chỉ hiện dần. */
  enter?: MotionEnter;
  /** Thứ tự trong nhóm — nhân với độ trễ. */
  index?: number;
  /** Đổi VỊ TRÍ trong danh sách thì trượt tới chỗ mới (bảng xếp hạng đổi thứ tự). */
  layout?: boolean;
}

/**
 * Khối có hiệu ứng vào/đổi chỗ chạy trên luồng UI (layout animation của Reanimated — không `setState` mỗi khung hình).
 *
 * ⛔ Tôn trọng "Giảm chuyển động": `useReducedMotion()` bật ⇒ KHÔNG truyền `entering`/`layout`, khối hiện ngay tại chỗ.
 * Chuyển động ở đây chỉ dẫn mắt (ai vừa vào phòng, ai vừa lên hạng), không mang thông tin — bỏ đi không mất gì.
 * ⚠️ Chỉ dùng cho danh sách NGẮN, có `key` ổn định (người chơi, ô đáp án, dòng bảng điểm) — không bọc hàng của `FlashList`.
 */
export function MotionView({
  children,
  className,
  enter = 'rise',
  index = 0,
  layout = false,
}: MotionViewProps) {
  const reduceMotion = useReducedMotion();
  const delay = Math.min(index, MAX_STEPS) * STAGGER_MS;
  const entering = reduceMotion ? undefined : enteringOf(enter, delay);
  const transition = reduceMotion || !layout ? undefined : LinearTransition.duration(LAYOUT_MS);

  return (
    <AnimatedView className={className} entering={entering} layout={transition}>
      {children}
    </AnimatedView>
  );
}

function enteringOf(kind: MotionEnter, delay: number) {
  if (kind === 'zoom') return ZoomIn.delay(delay).duration(ENTER_MS);
  if (kind === 'fade') return FadeIn.delay(delay).duration(ENTER_MS);
  return FadeInDown.delay(delay).duration(ENTER_MS);
}
