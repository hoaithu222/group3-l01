import { toErrorMessage } from '@/core/api/client.helpers';
import { EmptyState } from '@/shared/ui/empty-state';

export interface TaskDetailFailureProps {
  /** Lỗi tải thẻ — chỉ dùng cho `kind="error"` để hiện đúng câu lỗi từ máy chủ. */
  error?: unknown;
  /** `notFound` = thẻ đã xoá / mất quyền (404): khoá vàng + "Quay lại". `error` = tải hỏng: cảnh báo đỏ + "Thử lại". */
  kind: 'error' | 'notFound';
  /** "Quay lại" (`notFound`) hoặc "Thử lại" (`error`) — màn cha quyết định làm gì. */
  onAction: () => void;
}

/**
 * Hai trạng thái KHÔNG có nội dung của màn chi tiết thẻ. Tách khỏi `TaskDetailScreen` để màn đó giữ dưới trần 200 dòng
 * (thêm icon + tông cho hai `EmptyState` tại chỗ làm nó vượt trần). ⚠️ 404 ≠ lỗi tải: thử lại vẫn 404 nên không có nút "Thử lại".
 */
export function TaskDetailFailure({ error, kind, onAction }: TaskDetailFailureProps) {
  if (kind === 'notFound') {
    return (
      <EmptyState
        actions={[{ label: 'Quay lại', onPress: onAction }]}
        description="Thẻ này đã bị xoá hoặc bạn không còn quyền xem."
        icon="lock"
        title="Thẻ không còn tồn tại"
        tone="warning"
      />
    );
  }
  return (
    <EmptyState
      actions={[{ label: 'Thử lại', onPress: onAction }]}
      description={toErrorMessage(error)}
      icon="alert-warning"
      title="Không tải được thẻ"
      tone="danger"
    />
  );
}
