import { useEffect, useState } from 'react';

import { acquireRoom } from './room-subscriptions';
import type { RoomStatus } from './room-subscriptions';

export interface UseRoomSubscriptionOptions {
  /** `false` ⇒ không join (chưa biết `id`, màn chưa cần dữ liệu realtime của phòng này…). Mặc định `true`. */
  enabled?: boolean;
}

/**
 * Đăng ký quan tâm một phòng Socket.IO trong vòng đời component.
 *
 * ```tsx
 * const { status, code } = useRoomSubscription('conv', conversationId);
 * if (status === 'denied') return <ScreenState variant="no-access" code={code} />;
 * ```
 *
 * Refcount thật nằm ở `room-subscriptions.ts` — hai component cùng mở một
 * phòng chỉ sinh MỘT `room:join`; unmount cả hai mới `room:leave`. Rejoin sau
 * mất kết nối cũng do registry đó lo (`socket.on('connect')`), hook này chỉ
 * đọc lại trạng thái mới nhất.
 */
export function useRoomSubscription(
  kind: string,
  id: string | null | undefined,
  { enabled = true }: UseRoomSubscriptionOptions = {},
): RoomStatus {
  const [status, setStatus] = useState<RoomStatus>({ status: 'pending' });

  useEffect(() => {
    // Không cần tự `setStatus({status:'pending'})` ở đây khi tắt/thiếu `id` —
    // biểu thức trả về bên dưới đã ép `pending` cho ca đó rồi (và gọi `setState`
    // ĐỒNG BỘ trong thân effect bị `react-hooks/set-state-in-effect` chặn).
    if (!enabled || !id) return undefined;
    return acquireRoom(kind, id, setStatus);
  }, [kind, id, enabled]);

  return enabled && id ? status : { status: 'pending' };
}
