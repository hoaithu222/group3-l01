import { EmptyState } from '@/shared/ui/empty-state';
import { isNetworkError, toErrorMessage } from '@/shared/utils/errors';

import { isWorkspaceGone } from '../utils/workspace-errors';

interface WorkspaceLoadErrorProps {
  /** Lỗi của truy vấn chi tiết nhóm; `undefined` (không kèm lỗi) = không tìm thấy nhóm. */
  error: unknown;
  onRetry: () => void;
}

/**
 * Khối "không tải được nhóm" của ba màn cấp nhóm (tổng quan · cài đặt · quyền truy cập).
 *
 * Tách ra vì ba màn từng chép NGUYÊN khối này, và khi thêm icon cảnh báo + tông `danger` thì `WorkspaceSettingsScreen`
 * (đang 199 dòng) vượt trần 200. Một nơi duy nhất cũng giữ ba màn lỗi giống hệt nhau.
 *
 * Ba ca, cùng quy ước với `ScreenState` (`shared/ui/screen-state`):
 *  · MẤT MẠNG (không tới được máy chủ) → nói rõ là lỗi KẾT NỐI (`unlink`, tông trung tính) + "Thử lại" — có sóng là chữa được.
 *  · 403/404 (không còn là thành viên, nhóm đã xoá — BE trả 404 trung tính cho cả hai) hoặc không có nhóm → ổ khoá, tông
 *    `warning`, ⛔ KHÔNG "Thử lại": thử lại vẫn ra 404, nút chỉ khiến người dùng bấm mãi. Thoát bằng nút quay lại của `AppBar`.
 *  · lỗi khác (5xx…) → cảnh báo tông `danger` + "Thử lại".
 */
export function WorkspaceLoadError({ error, onRetry }: WorkspaceLoadErrorProps) {
  const retry = [{ label: 'Thử lại', onPress: onRetry }];

  if (isNetworkError(error)) {
    return (
      <EmptyState
        actions={retry}
        description={toErrorMessage(error)}
        icon="unlink"
        title="Mất kết nối"
        tone="neutral"
      />
    );
  }

  if (!error || isWorkspaceGone(error)) {
    return (
      <EmptyState
        description="Nhóm không tồn tại hoặc bạn không còn là thành viên của nhóm này."
        icon="lock"
        title="Không mở được nhóm"
        tone="warning"
      />
    );
  }

  return (
    <EmptyState
      actions={retry}
      description={toErrorMessage(error)}
      icon="alert-warning"
      title="Không tải được"
      tone="danger"
    />
  );
}
