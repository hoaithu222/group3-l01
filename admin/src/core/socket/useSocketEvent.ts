import { useEffect } from 'react';

import { useEventCallback } from '@/shared/hooks';

import { socket } from './socket.client';
import type { SocketEventName } from './socket.events';

/**
 * Đăng ký lắng nghe MỘT sự kiện Socket.IO trong vòng đời component.
 *
 * `handler` đi qua `useEventCallback` (identity ổn định, luôn gọi bản MỚI
 * NHẤT) thay vì tự viết `useRef` + gán trong render — gán ref lúc render vi
 * phạm `react-hooks/refs` (ESLint React Compiler rule). Nhờ identity ổn định,
 * effect chỉ gắn/gỡ lại khi `event` đổi, không phải mỗi lần component re-render.
 */
export function useSocketEvent<T = unknown>(
  event: SocketEventName,
  handler: (payload: T) => void,
): void {
  const stableHandler = useEventCallback(handler);

  useEffect(() => {
    const listener = (payload: T) => stableHandler(payload);
    socket.on(event, listener);
    return () => {
      socket.off(event, listener);
    };
  }, [event, stableHandler]);
}
