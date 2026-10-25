import type { ImageSource } from '@/core/uploads/use-display-image-upload';
import type { ActionMenuItem } from '@/shared/ui/action-menu';

export interface ImageSourceMenuOptions {
  onPick: (source: ImageSource) => void;
  /** Có ảnh đang dùng thì truyền để hiện dòng "Gỡ ảnh" (tông nguy hiểm, tự xuống cuối). Bỏ trống = ẩn. */
  onRemove?: () => void;
  removeLabel?: string;
}

/**
 * Các dòng của tấm chọn nguồn ảnh (`ActionMenuSheet`) — MỘT bộ nhãn/icon cho mọi màn đổi ảnh (hồ sơ, nhóm, nhóm chat).
 * `ActionMenuSheet` tự đóng tấm TRƯỚC rồi mới gọi `onPress` ⇒ trình chọn ảnh hệ thống không bị Modal của tấm nuốt (Android).
 * Bộ icon Figma chưa có `camera` ⇒ "Chụp ảnh" dùng `add-image` (cùng lựa chọn với menu đính kèm của chat).
 */
export function imageSourceMenuItems({ onPick, onRemove, removeLabel = 'Gỡ ảnh' }: ImageSourceMenuOptions): ActionMenuItem[] {
  return [
    { icon: 'add-image', key: 'camera', label: 'Chụp ảnh', onPress: () => onPick('camera') },
    { icon: 'image', key: 'library', label: 'Chọn từ thư viện', onPress: () => onPick('library') },
    {
      hidden: !onRemove,
      icon: 'delete',
      key: 'remove',
      label: removeLabel,
      onPress: () => onRemove?.(),
      tone: 'danger',
    },
  ];
}
