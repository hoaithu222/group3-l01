import { useQuery } from '@tanstack/react-query';

import { useAuthStore } from '@/app/store';
import { overviewService } from '@/core/api/admin';

import { OVERVIEW_FALLBACK_POLL_MS } from '../constants/dashboard.constants';
import { useOpsStatsSocket } from '../hooks/useOpsStatsSocket';
import { OVERVIEW_KEY } from './overview.keys';

export { OVERVIEW_KEY };

/**
 * Số liệu tổng quan cho `HomePage` — chỉ tải sau khi đăng nhập, cache 1 phút.
 *
 * 2 số `realtime.{socketConnections,onlineUsers}` cập nhật qua Socket.IO (`ops:stats` — BE cron `ops.stats-broadcast`, 30 s, chỉ khi có
 * admin ở phòng `admin:ops`): `useOpsStatsSocket` vá thẳng vào cache này, KHÔNG có `refetchInterval` khi phòng đã vào. Chỉ khi phòng
 * CHƯA vào được (mất kết nối, thiếu quyền `dashboard:view` — BE trả ack `denied`) mới poll lại `GET /admin/overview` mỗi 30 s để số không
 * đứng yên.
 */
export function useOverview() {
  const status = useAuthStore((s) => s.status);
  const room = useOpsStatsSocket();
  return useQuery({
    queryKey: OVERVIEW_KEY,
    queryFn: async () => (await overviewService.get()).data,
    enabled: status === 'authenticated',
    staleTime: 60_000,
    refetchInterval: room.status === 'joined' ? false : OVERVIEW_FALLBACK_POLL_MS,
  });
}
