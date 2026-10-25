import { useQueryClient } from '@tanstack/react-query';

import { useAuthStore } from '@/app/store';
import { SocketEvent, useRoomSubscription, useSocketEvent } from '@/core/socket';
import type { RoomStatus } from '@/core/socket';

import { refreshModeration } from '../service/moderation.queries';

/** Phòng Socket.IO của hàng đợi kiểm duyệt: `room:join { kind: 'admin', id: 'moderation' }`. */
const ROOM_KIND = 'admin';
const ROOM_ID = 'moderation';

/**
 * Vào phòng `admin:moderation` và làm mới hàng đợi/chi tiết/nhật ký khi có báo cáo mới hoặc một nhóm vừa
 * được xử lý (`moderation:report-created|updated`). Sự kiện KHÔNG kèm nội dung — chỉ là tín hiệu
 * để refetch; chi tiết luôn lấy lại qua REST (đã kiểm quyền).
 *
 * Chỉ `room:join` khi có `moderation:view` (BE cũng chặn bằng ack `ok:false`). Nhiều màn cùng gọi
 * hook này (hàng đợi, chi tiết, tab workspace) chỉ sinh MỘT lượt `room:join` (refcount ở
 * `useRoomSubscription`). ⛔ Không làm mới khoá `content` — xem `refreshModeration`.
 */
export function useModerationSocket(): RoomStatus {
  const queryClient = useQueryClient();
  const canView = useAuthStore((s) => s.hasPermission('moderation', 'view'));
  const room = useRoomSubscription(ROOM_KIND, ROOM_ID, { enabled: canView });

  const refresh = () => refreshModeration(queryClient);
  useSocketEvent(SocketEvent.MODERATION_REPORT_CREATED, refresh);
  useSocketEvent(SocketEvent.MODERATION_REPORT_UPDATED, refresh);

  return room;
}
