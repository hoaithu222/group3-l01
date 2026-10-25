import type { CallMediaConnectionState } from '@/core/media/call-media.types';
import { Alert } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';

export interface ConnectionNoticeProps {
  connection: CallMediaConnectionState;
  failed: boolean;
  /** Đang thử vào lại (nút "Thử lại" quay). */
  retrying: boolean;
  onRetry: () => void;
}

/**
 * Trạng thái kết nối media trong phòng (app.md §3): "Đang vào phòng…" tới khi CONNECTED; "Đang kết nối lại" (controller tự rời sau 30 s); nối hỏng
 * hẳn thì báo và cho thử lại. Đồng hồ KHÔNG phụ thuộc kết nối media (chạy theo server) nên các dòng này không che đồng hồ — chỉ nói vì sao chưa
 * nghe/nói được. `null` khi mọi thứ ổn.
 */
export function ConnectionNotice({ connection, failed, onRetry, retrying }: ConnectionNoticeProps) {
  if (failed) {
    return (
      <Alert
        actions={<Button label="Thử lại" loading={retrying} size="sm" variant="tertiary" onPress={onRetry} />}
        description="Đồng hồ vẫn chạy nhưng âm thanh phòng chưa kết nối. Thử vào lại hoặc rời phòng."
        title="Mất kết nối âm thanh"
        tone="error"
      />
    );
  }
  if (connection === 'reconnecting') {
    return (
      <Alert
        description="Sẽ tự rời phòng nếu quá 30 giây chưa nối lại được. Đồng hồ vẫn chạy theo máy chủ."
        title="Đang kết nối lại"
        tone="warning"
      />
    );
  }
  if (connection === 'connecting' || connection === 'idle') {
    return <Alert description="Đang vào phòng…" tone="info" />;
  }
  return null;
}
