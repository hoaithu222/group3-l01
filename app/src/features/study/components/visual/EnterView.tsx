import { type ReactNode } from 'react';
import { cssInterop } from 'nativewind';
import Animated, { FadeInDown, useReducedMotion } from 'react-native-reanimated';

/**
 * ⛔ BẮT BUỘC: `Animated.View` không nằm trong danh sách interop sẵn của NativeWind — thiếu dòng này thì `className` bị bỏ qua
 * ÂM THẦM (cùng lý do `Skeleton`). ⚠️ Chỉ đủ vì ở đây KHÔNG có `useAnimatedStyle`: hiệu ứng vào là prop `entering` (layout
 * animation), không phải một handle style — trộn handle với `className` mới làm vô hình cả khối (xem `shared/ui/AGENTS.md`).
 */
const AnimatedView = cssInterop(Animated.View, { className: 'style' });

/** Mỗi phần tử trễ thêm bấy nhiêu ms so với phần tử trước — đủ để mắt thấy "lần lượt hiện", chưa đủ để thấy chờ. */
const STAGGER_MS = 50;
/** Trần độ trễ: từ khối thứ 7 trở đi không chờ lâu hơn khối thứ 6 (nhóm dài không được biến thành màn trình diễn). */
const MAX_STEPS = 6;
const DURATION_MS = 260;

export interface EnterViewProps {
  children: ReactNode;
  /** Chỗ để nơi gọi đặt lớp BỐ CỤC của ô (`grow basis-[45%]`…) — animation không đụng vào. */
  className?: string;
  /** Thứ tự trong nhóm — nhân với `STAGGER_MS` thành độ trễ. */
  index?: number;
}

/**
 * Khối "trượt nhẹ + hiện dần" lúc XUẤT HIỆN LẦN ĐẦU (mở màn, dữ liệu vừa về). Một lần duy nhất mỗi lần gắn vào cây — cập nhật dữ
 * liệu sau đó không chạy lại.
 *
 * ⛔ Tôn trọng "Giảm chuyển động" của hệ điều hành: `useReducedMotion()` bật ⇒ KHÔNG truyền `entering` (khối hiện ngay, không
 * trượt/không mờ dần). Chuyển động ở đây chỉ để dẫn mắt, không mang thông tin — bỏ đi không mất gì.
 * ⚠️ Chỉ dùng cho khối CỐ ĐỊNH của màn (thẻ "Hôm nay", lưới chế độ, đầu trang tổng quan) — ⛔ không bọc hàng của `FlashList`:
 * ô được tái dùng khi cuộn nên animation chạy loạn.
 */
export function EnterView({ children, className, index = 0 }: EnterViewProps) {
  const reduceMotion = useReducedMotion();
  const entering = reduceMotion
    ? undefined
    : FadeInDown.delay(Math.min(index, MAX_STEPS) * STAGGER_MS).duration(DURATION_MS);

  return (
    <AnimatedView className={className} entering={entering}>
      {children}
    </AnimatedView>
  );
}
