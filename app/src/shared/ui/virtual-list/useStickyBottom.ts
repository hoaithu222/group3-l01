import { useCallback, useEffect, useRef, useState } from 'react';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';

export interface UseStickyBottomOptions {
  /** Gọi mỗi khi trạng thái "đã rời đáy" ĐỔI (không gọi mỗi sự kiện cuộn). */
  onChange?: (awayFromBottom: boolean) => void;
  /** Cách đáy tối đa bao nhiêu dp vẫn tính là "đang ở đáy". Mặc định 80. */
  threshold?: number;
}

export interface StickyBottom {
  /** `true` khi người dùng đã cuộn LÊN khỏi đáy quá `threshold` (đang đọc tin cũ). */
  awayFromBottom: boolean;
  /** Gắn vào `onScroll` của danh sách (kèm `scrollEventThrottle`). */
  onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
}

/**
 * Theo dõi "người dùng còn bám đáy danh sách không" — nền cho nút "Có N tin mới" và cho việc TỰ CUỘN khi tin mới tới (p0-12,
 * TX-07: KHÔNG tự cuộn khi người dùng đang đọc tin cũ).
 *
 * ```tsx
 * const { awayFromBottom, onScroll } = useStickyBottom();
 * // awayFromBottom = false → có tin mới thì cuộn xuống; true → hiện pill "Có N tin mới", đừng cuộn.
 * ```
 *
 * Khoảng cách tới đáy = `contentSize.height − (contentOffset.y + layoutMeasurement.height)`. Chỉ `setState` khi CỜ đổi (cuộn
 * 60 lần/giây không được vẽ lại 60 lần); `onChange` cũng chỉ bắn khi đổi. Hook thuần — không giữ tay cầm danh sách, nên dùng
 * được với cả `FlatList`/`FlashList`/`ScrollView`.
 */
export function useStickyBottom({ onChange, threshold = 80 }: UseStickyBottomOptions = {}): StickyBottom {
  const [awayFromBottom, setAway] = useState(false);
  // Đọc cờ hiện tại qua ref: handler cuộn ổn định (FlashList giữ callback từ lúc mount) mà không phụ thuộc state.
  const away = useRef(false);
  const notify = useRef(onChange);
  // Cập nhật ref trong effect (không phải lúc render — React Compiler cấm ghi `ref.current` khi render).
  useEffect(() => {
    notify.current = onChange;
  });

  const onScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
      const distance = contentSize.height - (contentOffset.y + layoutMeasurement.height);
      const next = distance > threshold;
      if (next === away.current) return;
      away.current = next;
      setAway(next);
      notify.current?.(next);
    },
    [threshold],
  );

  return { awayFromBottom, onScroll };
}
