import type { IconName } from '@/shared/ui/icon';

import type { ExplorerItem } from './explorer-items';

export type ItemActionKey = 'delete' | 'download' | 'locate' | 'move' | 'open' | 'rename' | 'share';

export interface ItemAction {
  danger?: boolean;
  icon: IconName;
  key: ItemActionKey;
  label: string;
}

export interface ItemActionContext {
  /**
   * `canModify` do BE tính cho mục này (của mình cần `folder.manage`, của người khác cần
   * `resource.delete`; workspace ARCHIVED ⇒ luôn `false`). Đổi tên/Di chuyển/Xoá cùng một cờ.
   */
  canModify: boolean;
  /** Đang xem kết quả tìm (trải toàn workspace) ⇒ có "Mở thư mục chứa tệp". */
  inSearch: boolean;
  /** Tải/chia sẻ cần mạng — offline thì ẩn hẳn thay vì để bấm rồi lỗi (app.md §3 "Offline"). */
  online: boolean;
}

/**
 * Menu hành động của MỘT mục, lọc theo `canModify` của BE (README p3-01 §6: MEMBER không
 * thấy "Xoá" tệp của người khác). Trả MẢNG đã lọc chứ không phải cờ `disabled` — nút
 * mờ không giải thích được vì sao, còn người dùng không cần biết có thao tác
 * nào đó tồn tại mà họ không được làm.
 *
 * Thư mục chỉ có Mở/Đổi tên/Di chuyển/Xoá (tải/chia sẻ chỉ cho tệp).
 */
export function buildItemActions(item: ExplorerItem, context: ItemActionContext): ItemAction[] {
  const { canModify, inSearch, online } = context;
  const isFile = item.kind === 'resource';
  const actions: (ItemAction | false)[] = [
    { icon: 'view', key: 'open', label: 'Mở' },
    isFile && inSearch && { icon: 'book', key: 'locate', label: 'Mở thư mục chứa tệp' },
    canModify && { icon: 'edit', key: 'rename', label: 'Đổi tên' },
    canModify && { icon: 'direct', key: 'move', label: 'Di chuyển' },
    isFile && online && { icon: 'share', key: 'share', label: 'Chia sẻ' },
    isFile && online && { icon: 'arrow-down', key: 'download', label: 'Tải về' },
    canModify && { danger: true, icon: 'delete', key: 'delete', label: 'Xoá' },
  ];
  return actions.filter((action): action is ItemAction => action !== false);
}
