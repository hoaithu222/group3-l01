import type { ActionMenuItem } from '../action-menu/ActionMenu';
import type { IconName } from '../icon';

/** Tông nền một nút vuốt: `base` (thương hiệu), `accent` (nhấn), `danger` (phá huỷ/không hoàn tác). */
export type SwipeActionTone = 'accent' | 'base' | 'danger';

/** Một hành động lộ ra khi vuốt hàng. */
export interface SwipeAction {
  /** Nhãn riêng cho trình đọc màn hình khi chữ hiện chưa đủ nghĩa ("Ghim cuộc trò chuyện"). Mặc định = `label`. */
  accessibilityLabel?: string;
  icon?: IconName;
  /** Khoá ổn định (không dùng nhãn: nhãn đổi theo trạng thái — "Ghim"/"Bỏ ghim"). */
  key: string;
  label: string;
  /** Chạy SAU khi hàng đã đóng lại. */
  onPress: () => void;
  tone?: SwipeActionTone;
}

/**
 * Hành động vuốt → mục của `ActionMenuSheet` — ĐƯỜNG THAY THẾ bắt buộc.
 *
 * ⛔ Mọi hành động chỉ có ở cử chỉ vuốt là hành động người dùng TalkBack/Switch Access/tay run KHÔNG dùng được. Nên nơi gọi luôn
 * mở CÙNG các hành động đó qua một menu (nhấn giữ hàng, hoặc nút "⋯"): `<ActionMenuSheet items={swipeActionsToMenuItems([...left,
 * ...right])} … />`. Hàm này chỉ đổi kiểu dữ liệu để hai đường luôn khớp nhau — thêm/bớt một hành động là một chỗ sửa.
 */
export function swipeActionsToMenuItems(actions: readonly SwipeAction[]): ActionMenuItem[] {
  return actions.map((action) => ({
    icon: action.icon,
    key: action.key,
    label: action.accessibilityLabel ?? action.label,
    onPress: action.onPress,
    tone: action.tone === 'danger' ? 'danger' : 'default',
  }));
}
