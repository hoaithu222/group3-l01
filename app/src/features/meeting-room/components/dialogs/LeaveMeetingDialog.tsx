import { ConfirmSheet } from '@/shared/ui/bottom-sheet';

import type { RoomPerson } from '../../utils/room-people.utils';
import { LeaveHostSheet } from './LeaveHostSheet';

export interface LeaveMeetingDialogProps {
  /** Đang gọi API rời/kết thúc — khoá mọi nút, không cho chọn lại. */
  busy?: boolean;
  /** Người có thể nhận quyền khi chủ trì rời: người thường đang kết nối (cha lọc). Rỗng ⇒ ẩn khả năng giao quyền. */
  candidates: readonly RoomPerson[];
  /** Chủ trì/đồng chủ trì ⇒ ba lựa chọn (rời · giao quyền · kết thúc cho mọi người); người thường ⇒ hộp thoại hai nút. */
  hostLike: boolean;
  visible: boolean;
  onClose: () => void;
  /** Kết thúc cho mọi người — chỉ gọi sau bước xác nhận thứ hai trong tấm chủ trì. */
  onEndForAll: () => void;
  onLeave: () => void;
  onLeaveAndTransfer: (userId: string) => void;
}

/**
 * Bấm "Rời" trong phòng (app.md p2-05 §3.2 `LeaveMeetingDialog`). Người thường: tấm xác nhận "Rời cuộc họp?" hai nút xếp dọc (nút đỏ "Rời
 * cuộc họp" trên — cùng màu nút Rời của thanh điều khiển, "Ở lại" dưới). Chủ trì/đồng chủ trì: `LeaveHostSheet` (ba lựa chọn, có bước chọn
 * người giao quyền và bước xác nhận cho kết thúc). Cả hai là tấm ĐÁY — cùng khuôn với mọi tấm của phòng, nút trong tầm ngón cái. Dựng có
 * điều kiện theo `visible` để mỗi lần mở đều bắt đầu từ bước đầu, không mang bước cũ của lần trước.
 */
export function LeaveMeetingDialog({
  busy = false,
  candidates,
  hostLike,
  visible,
  onClose,
  onEndForAll,
  onLeave,
  onLeaveAndTransfer,
}: LeaveMeetingDialogProps) {
  if (!visible) return null;

  if (hostLike) {
    return (
      <LeaveHostSheet
        busy={busy}
        candidates={candidates}
        onClose={onClose}
        onEndForAll={onEndForAll}
        onLeave={onLeave}
        onLeaveAndTransfer={onLeaveAndTransfer}
      />
    );
  }

  return (
    <ConfirmSheet
      actionsLayout="column"
      cancelLabel="Ở lại"
      confirmLabel="Rời cuộc họp"
      description="Bạn có thể vào lại nếu cuộc họp còn diễn ra và chưa bị khoá."
      icon="logout"
      loading={busy}
      title="Rời cuộc họp?"
      tone="danger"
      visible
      onClose={onClose}
      onConfirm={onLeave}
    />
  );
}
