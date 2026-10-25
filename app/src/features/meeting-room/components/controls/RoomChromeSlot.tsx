import { useEffect, type ReactNode } from 'react';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { MOTION_DURATION, MOTION_EASING } from '@/shared/ui/motion';

/** Trượt nhẹ khi ẩn (dp) — đủ để mắt thấy "lui ra mép", không đủ để kéo theo cảm giác bố cục xê dịch. */
const SLIDE_DP = 8;
/** `display: none` — chỉ dùng cho chế độ "toàn màn hình" mà người dùng CHỦ ĐỘNG bật (xem `collapsed`). */
const COLLAPSED = { display: 'none' } as const;

export interface RoomChromeSlotProps {
  children: ReactNode;
  /**
   * Gỡ hẳn khỏi bố cục (nhường chỗ) — CHỈ khi người dùng bấm "Toàn màn hình" ở nội dung chia sẻ: sân khấu được lớn ra đúng một lần theo ý
   * họ. Vẫn mount (giữ state của thanh), chỉ `display: none`.
   */
  collapsed?: boolean;
  /** Mép mà thanh "lui" về khi ẩn: tiêu đề `top`, thanh điều khiển `bottom`. */
  edge: 'bottom' | 'top';
  visible: boolean;
}

/**
 * Khe chứa tiêu đề / thanh điều khiển của phòng họp: ẩn = MỜ DẦN + trượt nhẹ (≤ `MOTION_DURATION.base`), KHÔNG gỡ khỏi bố cục.
 *
 * ⛔ Trước đây `InRoomView` GỠ tiêu đề + thanh khi tự ẩn (`chromeHidden ? null : …`) ⇒ sân khấu đổi kích thước mỗi lần ẩn/hiện: lưới đo lại
 * bề rộng và cuộn lại trang, khung video (SurfaceView) dựng lại, hình nhảy — 5 giây một lần khi xem chia sẻ. Giờ chỗ của thanh được GIỮ:
 * sân khấu đứng yên tuyệt đối, ô người không bao giờ bị thanh che (nhãn tên/"Đang nói"/✋ ở đáy ô vẫn đọc được).
 *
 * Ẩn ⇒ `pointerEvents="none"` (cú chạm rơi xuống lớp dưới, không bấm trúng nút vô hình) + ẩn khỏi trình đọc màn hình. "Giảm chuyển động"
 * ⇒ đổi tức thì. ⚠️ Thẻ mang `useAnimatedStyle` KHÔNG mang `className` và mảng `style` phải có `cssInterop={false}` (ESLint #11).
 */
export function RoomChromeSlot({
  children,
  collapsed = false,
  edge,
  visible,
}: RoomChromeSlotProps) {
  const reduceMotion = useReducedMotion();
  const shown = useSharedValue(visible ? 1 : 0);

  useEffect(() => {
    const target = visible ? 1 : 0;
    // Hiện: "đi vào" nhanh rồi đậu êm; ẩn: ngắn hơn ("rời khung" — mắt không cần theo thứ đang biến mất).
    shown.value = reduceMotion
      ? target
      : withTiming(target, {
          duration: visible ? MOTION_DURATION.base : MOTION_DURATION.fast,
          easing: visible ? MOTION_EASING.emphasizedDecelerate : MOTION_EASING.emphasizedAccelerate,
        });
  }, [reduceMotion, shown, visible]);

  const fade = useAnimatedStyle(() => ({
    opacity: shown.value,
    transform: [{ translateY: (1 - shown.value) * (edge === 'top' ? -SLIDE_DP : SLIDE_DP) }],
  }));

  return (
    <Animated.View
      accessibilityElementsHidden={!visible}
      cssInterop={false}
      importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'}
      pointerEvents={visible ? 'auto' : 'none'}
      style={[collapsed ? COLLAPSED : null, fade]}
    >
      {children}
    </Animated.View>
  );
}
