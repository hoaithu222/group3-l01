import { useQueryClient } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';

import { useAuthStore } from '@/app/store';
import type { AdminOverview } from '@/core/api/admin';
import { SocketEvent, useRoomSubscription, useSocketEvent } from '@/core/socket';
import type { RoomStatus } from '@/core/socket';

import { OVERVIEW_KEY } from '../service/overview.keys';
import type { OpsStatsPayload } from '../types/ops-stats.types';

/** Phòng Socket.IO của số liệu vận hành: `room:join { kind: 'admin', id: 'ops' }` (BE guard `dashboard:view`). */
const ROOM_KIND = 'admin';
const ROOM_ID = 'ops';

const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;

/**
 * Vá 2 số `realtime` vào cache `GET /admin/overview` — KHÔNG refetch (payload cùng dạng `realtime` của REST). Chưa có dữ liệu
 * (`old` undefined — lần tải đầu còn đang chạy) thì bỏ qua, REST sẽ trả số mới nhất; payload lỗi dạng (BE đổi hợp đồng) cũng bỏ qua
 * thay vì ghi `NaN` lên thẻ KPI.
 */
export function applyOpsStats(queryClient: QueryClient, payload: OpsStatsPayload): void {
  if (!isCount(payload?.socketConnections) || !isCount(payload?.onlineUsers)) return;
  const realtime = {
    socketConnections: payload.socketConnections,
    onlineUsers: payload.onlineUsers,
  };
  queryClient.setQueryData<AdminOverview>(OVERVIEW_KEY, (old) =>
    old ? { ...old, realtime } : old,
  );
}

/**
 * Vào phòng `admin:ops` và cập nhật ô KPI "Kết nối realtime"/"Người dùng trực tuyến" khi BE phát `ops:stats` (cron 30 s, CHỈ khi có admin
 * đang ở phòng). Chỉ `room:join` khi có `dashboard:view` (BE cũng chặn bằng ack `ok:false`); nhiều nơi cùng gọi chỉ sinh MỘT lượt
 * `room:join` (refcount ở `useRoomSubscription`). Trả trạng thái phòng để `useOverview` biết khi nào cần polling dự phòng.
 */
export function useOpsStatsSocket(): RoomStatus {
  const queryClient = useQueryClient();
  const canView = useAuthStore((s) => s.hasPermission('dashboard', 'view'));
  const room = useRoomSubscription(ROOM_KIND, ROOM_ID, { enabled: canView });

  useSocketEvent<OpsStatsPayload>(SocketEvent.OPS_STATS, (payload) =>
    applyOpsStats(queryClient, payload),
  );

  return room;
}
