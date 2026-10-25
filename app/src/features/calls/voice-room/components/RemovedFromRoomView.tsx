import { EmptyState } from '@/shared/ui/empty-state';

import type { CallEndedReason } from '../../store/call-signal.types';

const COPY: Partial<Record<CallEndedReason, { description: string; title: string }>> = {
  ARCHIVED: { description: 'Kênh hoặc nhóm này đã được lưu trữ.', title: 'Phòng đã đóng' },
  CONNECT_FAILED: { description: 'Kiểm tra mạng rồi vào lại từ màn phòng thoại của kênh.', title: 'Không kết nối được phòng' },
  EMPTY: { description: 'Phòng tự đóng vì không còn ai trong đó.', title: 'Phòng đã kết thúc' },
  HOST_ENDED: { description: 'Chủ phòng đã kết thúc phòng cho mọi người.', title: 'Phòng đã kết thúc' },
  MOVED_DEVICE: { description: 'Bạn đã vào phòng này từ thiết bị khác.', title: 'Đã chuyển sang thiết bị khác' },
  REMOVED_BY_HOST: { description: 'Bạn không vào lại được phiên này; phiên mới bắt đầu thì vào được.', title: 'Bạn đã được mời ra khỏi phòng' },
  REVOKED: { description: 'Bạn không còn quyền vào kênh này.', title: 'Bạn không còn ở trong phòng' },
};

export interface RemovedFromRoomViewProps {
  onClose: () => void;
  reason: CallEndedReason | undefined;
}

/**
 * Màn "phòng kết thúc / bạn không còn ở trong phòng" (app.md §3 `RemovedFromRoomView`): nói RÕ vì sao (bị mời ra ≠ mất quyền ≠ chủ phòng
 * kết thúc ≠ phòng tự đóng) và chỉ có một lối ra. Hiện trong thời gian `ended` ngắn của `CallHost`; trạng thái bền nằm ở preview
 * (`joinBlockedReason`), nên người dùng thấy lại lý do đó ngay khi quay về kênh.
 */
export function RemovedFromRoomView({ onClose, reason }: RemovedFromRoomViewProps) {
  const copy = (reason && COPY[reason]) ?? { description: 'Phòng thoại đã kết thúc.', title: 'Phòng đã kết thúc' };
  // Hình theo lý do: lỗi kết nối = cảnh báo đỏ; bị mời ra / mất quyền = khoá vàng; còn lại (phòng kết thúc, đổi máy…) = mic trung tính.
  const failed = reason === 'CONNECT_FAILED';
  const denied = reason === 'REMOVED_BY_HOST' || reason === 'REVOKED';
  return (
    <EmptyState
      actions={[{ label: 'Về kênh', onPress: onClose }]}
      description={copy.description}
      fullscreen
      icon={failed ? 'alert-warning' : denied ? 'lock' : 'mic-01'}
      title={copy.title}
      tone={failed ? 'danger' : denied ? 'warning' : 'neutral'}
    />
  );
}
