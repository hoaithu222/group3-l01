import { cssInterop } from 'nativewind';
import { type ReactNode } from 'react';
import Animated, {
  FadeIn,
  FadeInDown,
  LinearTransition,
  useReducedMotion,
  ZoomIn,
} from 'react-native-reanimated';

import { MOTION_DURATION, MOTION_EASING } from './motion.tokens';

/**
 * ⛔ BẮT BUỘC: `Animated.View` không nằm trong danh sách interop sẵn của NativeWind — thiếu dòng này thì `className` bị bỏ qua
 * ÂM THẦM (cùng lý do `Skeleton`). ⚠️ Chỉ đủ vì ở đây KHÔNG có `useAnimatedStyle`: hiệu ứng vào là prop `entering` (layout
 * animation), không phải một handle style — trộn handle với `className` mới làm vô hình cả khối (xem `shared/ui/AGENTS.md`).
 */
const AnimatedView = cssInterop(Animated.View, { className: 'style' });

/** Mỗi khối trễ thêm bấy nhiêu ms so với khối trước — đủ để mắt thấy "lần lượt hiện", chưa đủ để thấy chờ. */
export const REVEAL_STAGGER_MS = 50;
/** Trần độ trễ: từ khối thứ 7 trở đi không chờ lâu hơn khối thứ 6 (màn dài không được biến thành màn trình diễn). */
const MAX_STEPS = 6;
const DURATION_MS = 260;

export type RevealKind = 'fade' | 'rise' | 'zoom';

export interface RevealProps {
  /**
   * Trượt MƯỢT sang chỗ mới khi vị trí/cỡ của khối đổi SAU lần hiện đầu (ghim làm thứ tự đổi, khối bên trên mở rộng/thu gọn)
   * thay vì nhảy "cụp" sang chỗ mới. ⚠️ Chỉ có tác dụng khi `key` của khối ỔN ĐỊNH (id, không phải chỉ số mảng).
   */
  animateLayout?: boolean;
  children: ReactNode;
  /** Lớp BỐ CỤC của khối (`flex-1`, `w-1/2`…) — animation không đụng vào. */
  className?: string;
  /** Thứ tự trong nhóm — nhân với `REVEAL_STAGGER_MS` thành độ trễ (0 = hiện ngay). */
  index?: number;
  /** `rise` (mặc định) trượt lên + hiện dần · `fade` chỉ hiện dần · `zoom` nảy nhẹ từ nhỏ (hình minh hoạ, huy hiệu). */
  kind?: RevealKind;
}

/**
 * Khối "hiện dần" lúc XUẤT HIỆN LẦN ĐẦU (mở màn, dữ liệu vừa về) — cho màn tổng quan/cửa vào phân hệ bớt "bật" cái rụp.
 * Một lần duy nhất mỗi lần gắn vào cây: cập nhật dữ liệu sau đó KHÔNG chạy lại.
 *
 * ```tsx
 * <View className="gap-xl">
 *   <Reveal><ModuleBanner … /></Reveal>
 *   <Reveal index={1}><Section title="Hôm nay">…</Section></Reveal>
 * </View>
 * ```
 *
 * ── Khi nào dùng ─────────────────────────────────────────────────────────────
 * ✅ Khối CỐ ĐỊNH của màn: banner đầu phân hệ, thẻ thống kê, lưới lối tắt, `Section` đầu trang, hình minh hoạ rỗng.
 * ⛔ KHÔNG bọc hàng của `FlashList`/`FlatList`: ô được TÁI DÙNG khi cuộn ⇒ animation chạy loạn và giật khung hình.
 * ⛔ KHÔNG bọc thứ người dùng đang thao tác (ô nhập, nút gửi): chờ 260ms mới bấm được là chậm có chủ đích.
 * ⚠️ Danh sách ngắn tự `.map()` (≤ ~10 phần tử) thì được, với `index` tăng dần — trần `MAX_STEPS` giữ tổng thời gian ngắn.
 * ⚠️ `Reveal` là MỘT khối: bọc một fragment (`<>A B</>`) thì A và B thành con của lớp bọc, `gap-*` của cha KHÔNG còn chen
 * giữa chúng nữa (chúng dính nhau). Bọc từng khối một, hoặc đặt `className="gap-…"` lên chính `Reveal`.
 *
 * ── Trợ năng ─────────────────────────────────────────────────────────────────
 * ⛔ Tôn trọng "Giảm chuyển động" của hệ điều hành: `useReducedMotion()` bật ⇒ KHÔNG truyền `entering`, khối hiện ngay tại chỗ.
 * Chuyển động ở đây chỉ dẫn mắt, không mang thông tin — bỏ đi không mất gì. Lớp bọc không đổi cây trợ năng (không `accessible`).
 *
 * Cùng họ với `EnterView` (study) và `MotionView` (live-quiz) — hai bản đó giữ nguyên vì có nhịp riêng của phân hệ; màn MỚI
 * dùng bản dùng chung này.
 */
export function Reveal({
  animateLayout = false,
  children,
  className,
  index = 0,
  kind = 'rise',
}: RevealProps) {
  const reduceMotion = useReducedMotion();
  const delay = Math.min(Math.max(index, 0), MAX_STEPS) * REVEAL_STAGGER_MS;
  const entering = reduceMotion ? undefined : enteringOf(kind, delay);
  const layout =
    reduceMotion || !animateLayout
      ? undefined
      : LinearTransition.duration(MOTION_DURATION.base).easing(MOTION_EASING.standard);

  return (
    <AnimatedView className={className} entering={entering} layout={layout}>
      {children}
    </AnimatedView>
  );
}

function enteringOf(kind: RevealKind, delay: number) {
  if (kind === 'zoom') return ZoomIn.delay(delay).duration(DURATION_MS);
  if (kind === 'fade') return FadeIn.delay(delay).duration(DURATION_MS);
  return FadeInDown.delay(delay).duration(DURATION_MS);
}
