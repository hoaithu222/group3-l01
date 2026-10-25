import { ActionMenuSheet } from '@/shared/ui/action-menu';

export interface TaskMenuSheetProps {
  alreadyAssigned: boolean;
  assigning: boolean;
  canDelete: boolean;
  /** Quyền tạo thẻ của BẢNG (`workspace.task.create`) VÀ đang online, thẻ chưa xoá ⇒ có "Nhân bản thẻ". */
  canDuplicate?: boolean;
  canEdit: boolean;
  visible: boolean;
  onAssignToMe: () => void;
  onClose: () => void;
  onCopyLink: () => void;
  onDelete: () => void;
  onDuplicate?: () => void;
}

/**
 * Menu "…" của thẻ (app.md §2 `TaskHeader`): Giao cho tôi · Nhân bản thẻ (p3-03 P1, mở `DuplicateTaskSheet`) · Sao chép link · Xoá thẻ.
 * "Giao cho tôi" chỉ hiện khi mình CHƯA là người làm và được sửa; "Nhân bản thẻ" chỉ hiện khi tạo được thẻ; "Xoá thẻ" chỉ hiện khi `myPermissions.delete` (người tạo hoặc
 * OWNER/ADMIN). "Sao chép link" luôn có — người chỉ xem vẫn chia sẻ được thẻ.
 *
 * Dựng bằng `ActionMenuSheet` của bộ chung (hàng `ListItem`, "Xoá" đỏ đặt cuối) — trước đây là ba nút `secondary` cùng độ
 * nổi xếp dọc, không hành động nào tách khỏi hành động phá huỷ.
 */
export function TaskMenuSheet({
  alreadyAssigned,
  assigning,
  canDelete,
  canDuplicate,
  canEdit,
  visible,
  onAssignToMe,
  onClose,
  onCopyLink,
  onDelete,
  onDuplicate,
}: TaskMenuSheetProps) {
  return (
    <ActionMenuSheet
      items={[
        {
          disabled: assigning,
          hidden: !canEdit || alreadyAssigned,
          icon: 'user-add',
          key: 'assign',
          label: 'Giao cho tôi',
          onPress: onAssignToMe,
        },
        { hidden: !canDuplicate || !onDuplicate, icon: 'copy', key: 'duplicate', label: 'Nhân bản thẻ', onPress: () => onDuplicate?.() },
        { icon: 'link', key: 'copy', label: 'Sao chép link', onPress: onCopyLink },
        { hidden: !canDelete, icon: 'delete', key: 'delete', label: 'Xoá thẻ', onPress: onDelete, tone: 'danger' },
      ]}
      title="Tuỳ chọn thẻ"
      visible={visible}
      onClose={onClose}
    />
  );
}
