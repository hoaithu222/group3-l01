import { useQueryClient } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';

import { useAuthStore } from '@/app/store';
import { SocketEvent, useRoomSubscription, useSocketEvent } from '@/core/socket';
import type { RoomStatus } from '@/core/socket';
import { workspaceRecordingsKeys } from '@/features/workspace/service/workspace-recordings.queries';

import { meetingKeys } from '../service/meeting.queries';
import type { AdminMediaUpdatedPayload } from '../types/meeting.types';

/** Phòng Socket.IO của vận hành gọi & họp: `room:join { kind: 'admin', id: 'media' }`. */
const ROOM_KIND = 'admin';
const ROOM_ID = 'media';

const DETAIL_PREFIX = ['meeting', 'detail'] as const;

/**
 * Làm mới đúng nhóm query theo `kind` của sự kiện (admin.md p2-07 §3): cuộc họp → danh sách + chi tiết cuộc họp đó; cuộc gọi → mọi truy vấn cuộc
 * gọi (danh sách/chi tiết/thống kê) + chi tiết cuộc họp (phiên hiện tại đổi theo cuộc gọi); bản ghi hình → bảng ghi hình + chi tiết cuộc họp
 * (khối ghi hình). Sự kiện lạ (BE thêm `kind` mới) bị bỏ qua thay vì làm mới bừa.
 */
export function refreshMediaOps(queryClient: QueryClient, payload: AdminMediaUpdatedPayload): void {
  const invalidate = (queryKey: readonly unknown[]) =>
    void queryClient.invalidateQueries({ queryKey });

  switch (payload.kind) {
    case 'MEETING':
      invalidate(meetingKeys.meetingList);
      invalidate(typeof payload.id === 'string' ? meetingKeys.detail(payload.id) : DETAIL_PREFIX);
      break;
    case 'CALL':
      invalidate(meetingKeys.calls);
      invalidate(DETAIL_PREFIX);
      break;
    case 'RECORDING':
      invalidate(workspaceRecordingsKeys.all);
      invalidate(DETAIL_PREFIX);
      break;
    default:
      break;
  }
}

/**
 * Vào phòng `admin:media` và làm mới bảng khi có cuộc họp/cuộc gọi/bản ghi hình đổi (`admin:media-updated`). Sự kiện KHÔNG kèm nội dung — chỉ là tín
 * hiệu để refetch; dữ liệu luôn lấy lại qua REST (đã kiểm quyền). Chỉ `room:join` khi có `meeting:view` (BE cũng chặn bằng ack `ok:false`); nhiều nơi
 * cùng gọi chỉ sinh MỘT lượt `room:join` (refcount ở `useRoomSubscription`).
 */
export function useAdminMediaSocket(): RoomStatus {
  const queryClient = useQueryClient();
  const canView = useAuthStore((s) => s.hasPermission('meeting', 'view'));
  const room = useRoomSubscription(ROOM_KIND, ROOM_ID, { enabled: canView });

  useSocketEvent<AdminMediaUpdatedPayload>(SocketEvent.ADMIN_MEDIA_UPDATED, (payload) =>
    refreshMediaOps(queryClient, payload),
  );

  return room;
}
