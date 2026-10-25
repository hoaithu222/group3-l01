import { Pressable, Text, View } from 'react-native';

import { Icon } from '../icon';
import type { SwipeAction, SwipeActionTone } from './swipe-actions';

/** Bề rộng MỖI nút vuốt (dp) — đủ cho icon 20 + nhãn 2 chữ ở `text-caption-sm`, và ≥ 44dp chạm. */
export const SWIPE_ACTION_WIDTH = 76;

/**
 * ⛔ Ba tông CỐ ĐỊNH, không ghép `bg-${tone}` động: NativeWind quét chuỗi TĨNH để sinh CSS, class ghép lúc chạy không sinh gì và
 * nút mất nền mà không lỗi nào báo. Chữ/icon dùng ĐÚNG cặp `*-fg` của nền `action-*` (đảo chiều đúng ở chế độ tối), không
 * `fg-inverse` chung.
 */
const TONE: Record<
  SwipeActionTone,
  { fg: 'action-accent-fg' | 'action-error-fg' | 'action-fg'; root: string; text: string }
> = {
  accent: {
    fg: 'action-accent-fg',
    root: 'h-full min-h-14 items-center justify-center gap-3xs bg-action-accent',
    text: 'text-caption-sm text-action-accent-fg',
  },
  base: {
    fg: 'action-fg',
    root: 'h-full min-h-14 items-center justify-center gap-3xs bg-action-base',
    text: 'text-caption-sm text-action-fg',
  },
  danger: {
    fg: 'action-error-fg',
    root: 'h-full min-h-14 items-center justify-center gap-3xs bg-action-error',
    text: 'text-caption-sm text-action-error-fg',
  },
};

export interface SwipeActionsPanelProps {
  actions: readonly SwipeAction[];
  /** Hàng đã lộ nút này ra chưa. Chưa lộ ⇒ nút bị ẨN khỏi trình đọc màn hình (đường thay thế là menu — xem `swipeActionsToMenuItems`). */
  open: boolean;
  /** Đóng hàng lại — gọi TRƯỚC `onPress` của hành động. */
  onClose: () => void;
}

/** Dãy nút nằm sau hàng (trái hoặc phải). */
export function SwipeActionsPanel({ actions, onClose, open }: SwipeActionsPanelProps) {
  return (
    <View
      // Nút còn khuất sau hàng mà vẫn nằm trong cây trợ năng thì TalkBack lia tới "nút ma": bấm mà không thấy gì xảy ra. Ẩn tới khi
      // lộ ra — cả HAI prop (`accessibilityElementsHidden` là iOS, `importantForAccessibility` là Android).
      accessibilityElementsHidden={!open}
      className="flex-row"
      importantForAccessibility={open ? 'auto' : 'no-hide-descendants'}
    >
      {actions.map((action) => {
        const tone = TONE[action.tone ?? 'base'];
        return (
          <Pressable
            key={action.key}
            accessibilityLabel={action.accessibilityLabel ?? action.label}
            accessibilityRole="button"
            className={tone.root}
            style={{ width: SWIPE_ACTION_WIDTH }}
            onPress={() => {
              onClose();
              action.onPress();
            }}
          >
            {action.icon ? <Icon color={tone.fg} name={action.icon} size={20} /> : null}
            <Text className={tone.text} numberOfLines={1}>
              {action.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
