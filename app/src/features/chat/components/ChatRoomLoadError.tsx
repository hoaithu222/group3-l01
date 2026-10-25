import { toErrorMessage } from '@/core/api/client.helpers';
import { EmptyState } from '@/shared/ui/empty-state';

interface ChatRoomLoadErrorProps {
  error: unknown;
  onRetry: () => void;
}

/**
 * Lỗi tải danh sách tin của phòng chat (kênh · hội thoại · luồng) + nút "Thử lại".
 *
 * Tách khỏi `ChatRoom` chỉ để file đó không phình quá trần độ dài (`scripts/file-size-manifest.json`): thêm icon
 * cảnh báo + tông `danger` cho khối lỗi làm nó dài thêm hai dòng, mà `ChatRoom` đang đứng đúng ở `max` đã khai.
 */
export function ChatRoomLoadError({ error, onRetry }: ChatRoomLoadErrorProps) {
  return (
    <EmptyState
      actions={[{ label: 'Thử lại', onPress: onRetry }]}
      description={toErrorMessage(error)}
      fullscreen
      icon="alert-warning"
      title="Không tải được"
      tone="danger"
    />
  );
}
