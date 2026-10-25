import { useCallback, useMemo, useState } from 'react';
import { useWindowDimensions, type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  resolveTooltipGeometry,
  type TooltipAnchor,
  type TooltipPlacement,
} from './tooltip-geometry.utils';
import { TOOLTIP_MAX_WIDTH, TOOLTIP_MIN_WIDTH, TOOLTIP_SCREEN_EDGE_GAP } from './tooltip.constants';

/**
 * Đo bong bóng rồi tính chỗ đặt nó trong lớp phủ toàn màn hình.
 *
 * ── Vì sao phải đo, thay vì đặt `absolute` như trên web ──────────────────────
 * React Native KHÔNG có `position: fixed`. Bong bóng đặt `absolute` vẫn nằm
 * trong cây cha, nên nó bị `overflow: hidden` của thẻ cha CẮT MẤT — chuyện chắc
 * chắn xảy ra khi tooltip nằm trong `ScrollView` hoặc trong một thẻ bo góc.
 * Cách chạy được: đo phần tử kích hoạt bằng `measureInWindow` (toạ độ theo CỬA
 * SỔ, không theo cha) rồi vẽ bong bóng trong `<Modal transparent>` phủ toàn màn.
 *
 * ⚠️ Vẫn phải đo thêm CHÍNH bong bóng: chiều cao của nó phụ thuộc chỗ chữ xuống
 * dòng, mà chỗ xuống dòng lại phụ thuộc bề rộng đã kẹp theo màn hình. Không có
 * cách nào biết trước, nên `geometry` là `null` ở nhịp vẽ đầu tiên và nơi gọi
 * phải giấu bong bóng đi (`opacity: 0`) cho tới nhịp thứ hai.
 */
export function useTooltipPosition(anchor: TooltipAnchor | null, placement: TooltipPlacement) {
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const [bubble, setBubble] = useState<{ height: number; width: number } | null>(null);

  /**
   * ⚠️ Phải so sánh trước khi `setState`. `onLayout` bắn lại sau mỗi lần bong
   * bóng đổi vị trí; tạo object mới mỗi lần là vẽ lại vô hạn.
   */
  const onBubbleLayout = useCallback((event: LayoutChangeEvent) => {
    const { height, width } = event.nativeEvent.layout;
    setBubble((prev) =>
      prev?.height === height && prev.width === width ? prev : { height, width },
    );
  }, []);

  /** Quên gọi khi đóng thì lần mở sau bong bóng nhấp nháy một nhịp ở kích thước cũ. */
  const forgetSize = useCallback(() => setBubble(null), []);

  /**
   * ⛔ Đừng dùng thẳng 343 của Figma. Thiết kế vẽ trên khung 375dp; máy 320dp
   * vẫn còn nhiều ngoài thị trường và ở đó bong bóng sẽ tràn ra khỏi màn.
   */
  const maxWidth = Math.min(
    TOOLTIP_MAX_WIDTH,
    window.width - insets.left - insets.right - TOOLTIP_SCREEN_EDGE_GAP * 2,
  );

  const geometry = useMemo(() => {
    if (!anchor || !bubble) return null;
    return resolveTooltipGeometry(
      anchor,
      bubble,
      {
        bottom: window.height - insets.bottom - TOOLTIP_SCREEN_EDGE_GAP,
        left: insets.left + TOOLTIP_SCREEN_EDGE_GAP,
        right: window.width - insets.right - TOOLTIP_SCREEN_EDGE_GAP,
        top: insets.top + TOOLTIP_SCREEN_EDGE_GAP,
      },
      placement,
    );
  }, [anchor, bubble, insets, placement, window]);

  return {
    forgetSize,
    geometry,
    maxWidth,
    minWidth: Math.min(TOOLTIP_MIN_WIDTH, maxWidth),
    onBubbleLayout,
  };
}
