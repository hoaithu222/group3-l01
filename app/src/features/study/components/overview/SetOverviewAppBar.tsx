import { router } from 'expo-router';

import { ActionMenu } from '@/shared/ui/action-menu';
import { Button } from '@/shared/ui/button';
import { AppBar } from '@/shared/ui/navigation';

import type { StudySetDetailDto } from '../../api/study.types';
import { setEditHref, setInfoHref } from '../../utils/study-routes';

export interface SetOverviewAppBarProps {
  /** Chưa có bộ (đang tải/lỗi) ⇒ chỉ có tiêu đề + nút quay lại, không có thao tác nào. */
  data?: StudySetDetailDto;
  /** Đang gọi "Sao chép" — khoá hàng menu để không nhân đôi bản sao. */
  duplicating: boolean;
  /** Tác giả sửa được VÀ bộ còn ACTIVE (bộ bị ẩn thì không sửa được). */
  editable: boolean;
  setId: string;
  onCopy: () => void;
  onDelete: () => void;
  /** Ẩn bộ của nhóm — chỉ hiện khi server bật `myPermissions.hide` (OWNER/ADMIN nhóm, bộ còn ACTIVE, không phải tác giả). */
  onHide: () => void;
  onReport: () => void;
  onStopSr: () => void;
  /** Khôi phục bộ đã ẩn — chỉ hiện khi server bật `myPermissions.unhide`. */
  onUnhide: () => void;
}

/**
 * Thanh tiêu đề của tổng quan bộ: thao tác QUẢN LÝ bộ nằm ở đây, KHÔNG xếp thành nút rộng dưới màn — "Sửa nội dung" là icon riêng cho tác giả,
 * phần còn lại gom vào menu "⋯" (sửa thông tin, sao chép, ngừng ôn, báo cáo, và của quản trị nhóm: ẩn / khôi phục bộ; xoá là hàng đỏ CUỐI, vẫn qua
 * hộp thoại xác nhận). Hiện/ẩn từng mục theo `myPermissions` của SERVER — client không suy từ vai trò.
 */
export function SetOverviewAppBar({
  data,
  duplicating,
  editable,
  onCopy,
  onDelete,
  onHide,
  onReport,
  onStopSr,
  onUnhide,
  setId,
}: SetOverviewAppBarProps) {
  const perms = data?.myPermissions;

  return (
    <AppBar
      actions={
        data ? (
          <>
            {editable ? (
              <Button
                accessibilityLabel="Sửa nội dung bộ học"
                iconLeft="edit"
                iconOnly
                size="sm"
                variant="tertiary"
                onPress={() => router.push(setEditHref(setId))}
              />
            ) : null}
            <ActionMenu
              accessibilityLabel="Thêm tuỳ chọn cho bộ học"
              items={[
                {
                  icon: 'setting',
                  key: 'info',
                  label: 'Sửa thông tin',
                  hidden: !editable,
                  onPress: () => router.push(setInfoHref(setId)),
                },
                {
                  disabled: duplicating,
                  icon: 'copy',
                  key: 'duplicate',
                  label: 'Sao chép về của tôi',
                  hidden: perms?.duplicate !== true,
                  onPress: onCopy,
                },
                {
                  icon: 'clock',
                  key: 'stop-sr',
                  label: 'Ngừng ôn bộ này',
                  hidden: data.itemCount === 0,
                  onPress: onStopSr,
                },
                {
                  icon: 'alert-warning',
                  key: 'report',
                  label: 'Báo cáo bộ học',
                  hidden: perms?.report !== true,
                  onPress: onReport,
                },
                {
                  description: 'Bộ biến khỏi danh sách của thành viên nhóm',
                  icon: 'hide',
                  key: 'hide',
                  label: 'Ẩn bộ học',
                  hidden: perms?.hide !== true,
                  tone: 'danger',
                  onPress: onHide,
                },
                {
                  description: 'Hiện lại bộ với thành viên nhóm',
                  icon: 'view',
                  key: 'unhide',
                  label: 'Khôi phục bộ học',
                  hidden: perms?.unhide !== true,
                  onPress: onUnhide,
                },
                {
                  icon: 'delete',
                  key: 'delete',
                  label: 'Xoá bộ học',
                  hidden: perms?.delete !== true,
                  tone: 'danger',
                  onPress: onDelete,
                },
              ]}
              title={data.title}
            />
          </>
        ) : undefined
      }
      title="Bộ học"
      onBack={router.back}
    />
  );
}
