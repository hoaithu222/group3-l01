import { View } from 'react-native';

import { ActionMenu } from '@/shared/ui/action-menu';
import { Button } from '@/shared/ui/button';

export interface ExpenseHeaderActionsProps {
  /** Mất mạng ⇒ chỉ đọc (app.md §3, cột Offline): khoá cả ba hành động, nói lý do ở dòng mô tả của menu. */
  offline: boolean;
  onAdjust: () => void;
  /** Chỉ YÊU CẦU xoá — hộp thoại xác nhận do màn cha mở (`ExpenseDeleteDialog`). */
  onDelete: () => void;
  onEdit: () => void;
}

/**
 * Hành động của khoản chi ở THANH TIÊU ĐỀ: "Sửa" là icon riêng (hành động thường dùng nhất), "Tạo khoản điều chỉnh"
 * và "Xoá khoản chi" gom vào menu "⋯". Trước đây ba nút nằm cuối thân màn (Sửa · Xoá cạnh nhau cùng độ nổi + một link) —
 * phải cuộn tới mới thấy, và nút xoá đứng sát nút sửa. Trong menu, thao tác phá huỷ nằm CUỐI, chữ đỏ, và vẫn qua hộp
 * thoại xác nhận.
 *
 * Màn cha chỉ vẽ component này khi `canEditOrDelete` (xem `expenseActionState`); khoản đã khoá thì thân màn có
 * `ExpenseLockedNotice` với lối "Tạo khoản điều chỉnh" riêng.
 */
export function ExpenseHeaderActions({
  offline,
  onAdjust,
  onDelete,
  onEdit,
}: ExpenseHeaderActionsProps) {
  const offlineNote = offline ? 'Cần kết nối mạng' : undefined;

  return (
    <View className="flex-row items-center gap-2xs">
      <Button
        accessibilityLabel="Sửa khoản chi"
        disabled={offline}
        iconLeft="edit"
        iconOnly
        size="sm"
        variant="tertiary"
        onPress={onEdit}
      />
      <ActionMenu
        accessibilityLabel="Thêm thao tác cho khoản chi"
        items={[
          {
            description: offlineNote ?? 'Ghi lại số đúng mà không sửa bản gốc',
            disabled: offline,
            icon: 'reload',
            key: 'adjust',
            label: 'Tạo khoản điều chỉnh',
            onPress: onAdjust,
          },
          {
            description: offlineNote ?? 'Số dư của những người tham gia được tính lại',
            disabled: offline,
            icon: 'delete',
            key: 'delete',
            label: 'Xoá khoản chi',
            onPress: onDelete,
            tone: 'danger',
          },
        ]}
      />
    </View>
  );
}
