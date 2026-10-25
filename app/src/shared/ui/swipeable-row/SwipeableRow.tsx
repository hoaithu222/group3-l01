import { useRef, useState, type ReactNode, type Ref } from 'react';
import ReanimatedSwipeable, {
  SwipeDirection,
  type SwipeableMethods,
} from 'react-native-gesture-handler/ReanimatedSwipeable';

import { SwipeActionsPanel } from './SwipeActionsPanel';
import type { SwipeAction } from './swipe-actions';

export interface SwipeableRowProps {
  children: ReactNode;
  /** Tắt cử chỉ vuốt (vd đang chọn nhiều, đang kéo thả). Hàng đang mở thì được đóng lại. */
  disabled?: boolean;
  /** Hành động lộ ra khi vuốt SANG PHẢI (nằm bên trái hàng). */
  leftActions?: readonly SwipeAction[];
  /** Gọi khi một bên vừa mở hẳn — để đóng các hàng khác (danh sách chỉ nên mở MỘT hàng). */
  onOpen?: (direction: 'left' | 'right') => void;
  /** Ref điều khiển từ ngoài: `close()`, `openLeft()`, `openRight()`, `reset()`. */
  ref?: Ref<SwipeableMethods>;
  /** Hành động lộ ra khi vuốt SANG TRÁI (nằm bên phải hàng). */
  rightActions?: readonly SwipeAction[];
}

/**
 * Hàng danh sách vuốt ngang để lộ hành động (ghim, tắt tiếng, lưu trữ, xoá…) — dựng trên `ReanimatedSwipeable` của
 * `react-native-gesture-handler` (p0-12). Bản trước (`Swipeable`) đã deprecated; `GestureHandlerRootView` đã bọc ở `AppProviders`.
 *
 * ```tsx
 * <SwipeableRow
 *   leftActions={[{ key: 'pin', icon: 'star', label: 'Ghim', onPress: pin }]}
 *   rightActions={[{ key: 'del', icon: 'delete', label: 'Xoá', tone: 'danger', onPress: remove }]}
 *   ref={rowRef}
 * >
 *   <ConversationRow … onLongPress={openMenu} />
 * </SwipeableRow>
 * ```
 *
 * ── ⛔ Trợ năng: vuốt KHÔNG phải cách duy nhất ────────────────────────────────────────────────────────────────────────
 * TalkBack/Switch Access/người tay run không vuốt được. MỌI hành động ở đây phải có đường thay thế trong menu — nhấn giữ hàng
 * hoặc nút "⋯" mở `ActionMenuSheet` với `swipeActionsToMenuItems([...left, ...right])`. Nút vuốt khuất sau hàng bị ẨN khỏi trình đọc
 * màn hình cho tới khi lộ ra (không có "nút ma"), nên menu là đường DUY NHẤT của họ — nơi gọi không được quên.
 *
 * Bấm một hành động: hàng ĐÓNG lại rồi `onPress` chạy. Overshoot tắt (không kéo quá dãy nút). `ref` ở Android chỉ mở ra sau khi đã
 * gắn xong bố cục — gọi từ sự kiện của người dùng, không gọi ngay trong lúc mount.
 */
export function SwipeableRow({
  children,
  disabled = false,
  leftActions,
  onOpen,
  ref,
  rightActions,
}: SwipeableRowProps) {
  const [open, setOpen] = useState<'left' | 'right' | null>(null);
  // Giữ tay cầm của chính hàng để nút hành động đóng được hàng (kể cả khi `ref` ngoài không được truyền).
  const inner = useRef<SwipeableMethods | null>(null);

  const bind = (methods: SwipeableMethods | null) => {
    inner.current = methods;
    if (typeof ref === 'function') ref(methods);
    else if (ref) ref.current = methods;
  };

  const hasLeft = (leftActions?.length ?? 0) > 0;
  const hasRight = (rightActions?.length ?? 0) > 0;

  return (
    <ReanimatedSwipeable
      ref={bind}
      enabled={!disabled && (hasLeft || hasRight)}
      friction={2}
      overshootLeft={false}
      overshootRight={false}
      renderLeftActions={
        hasLeft && leftActions
          ? () => (
              <SwipeActionsPanel
                actions={leftActions}
                open={open === 'left'}
                onClose={() => inner.current?.close()}
              />
            )
          : undefined
      }
      renderRightActions={
        hasRight && rightActions
          ? () => (
              <SwipeActionsPanel
                actions={rightActions}
                open={open === 'right'}
                onClose={() => inner.current?.close()}
              />
            )
          : undefined
      }
      onSwipeableClose={() => setOpen(null)}
      onSwipeableOpen={(direction) => {
        // RNGH đặt tên theo phía CỦA HÀNG bị kéo: `LEFT` = hàng trượt sang trái = lộ dãy nút BÊN PHẢI.
        const side = direction === SwipeDirection.LEFT ? 'right' : 'left';
        setOpen(side);
        onOpen?.(side);
      }}
    >
      {children}
    </ReanimatedSwipeable>
  );
}
