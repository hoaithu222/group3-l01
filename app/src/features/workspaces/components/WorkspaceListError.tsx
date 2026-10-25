import { EmptyState } from '@/shared/ui/empty-state';
import { isNetworkError, toErrorMessage } from '@/shared/utils/errors';

export interface WorkspaceListErrorProps {
  error: unknown;
  onRetry: () => void;
}

/**
 * Không tải được danh sách nhóm VÀ chưa có bản nào trong cache (lần mở đầu tiên). Có bản cũ thì màn KHÔNG tới đây — nó giữ
 * danh sách và chỉ báo một dòng (`WorkspaceListScreen`).
 *
 * Hai ca, cùng quy ước với `ScreenState`/`WorkspaceLoadError`:
 *  · MẤT MẠNG (không tới được máy chủ) → nói rõ là lỗi KẾT NỐI (`unlink`, tông trung tính): có sóng là chữa được, không phải
 *    app hỏng (`mobile-ux.md` "Trạng thái mạng").
 *  · lỗi khác → cảnh báo tông `danger` + câu lỗi của BE.
 * Cả hai đều có "Thử lại" (danh sách của CHÍNH MÌNH không có ca 403/404 như một nhóm cụ thể).
 */
export function WorkspaceListError({ error, onRetry }: WorkspaceListErrorProps) {
  const actions = [{ label: 'Thử lại', onPress: onRetry }];
  if (isNetworkError(error)) {
    return (
      <EmptyState
        actions={actions}
        description="Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại."
        icon="unlink"
        title="Mất kết nối"
        tone="neutral"
      />
    );
  }
  return (
    <EmptyState
      actions={actions}
      description={toErrorMessage(error)}
      icon="alert-warning"
      title="Không tải được danh sách nhóm"
      tone="danger"
    />
  );
}
