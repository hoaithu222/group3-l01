/**
 * @file useMultiTabSync.ts
 * @description Đồng bộ trạng thái giữa các tab cùng trình duyệt — phủ ca một
 * người dùng mở nhiều tab (đăng xuất/đăng nhập ở tab này thì tab kia phải biết).
 *
 * Lớp bọc React mỏng trên `tab-sync.utils` (BroadcastChannel, rơi về `storage`
 * event cho trình duyệt cũ). Mã KHÔNG nằm trong cây component (interceptor HTTP…)
 * gọi thẳng `postTabMessage` / `subscribeTabMessages` ở đó.
 *
 * Ví dụ (đúng kiểu đang dùng cho phiên đăng nhập — xem `useSessionSync`):
 *   useMultiTabSync<{ type: 'ended' | 'started' }>('auth', (msg) => {
 *     if (msg.type === 'ended') purgeAuthSession(null, { broadcast: false });
 *   });
 *
 *   const broadcast = useMultiTabBroadcaster<{ type: 'ended' }>('auth');
 *   broadcast({ type: 'ended' });
 */
import { useCallback, useEffect } from 'react';
import { postTabMessage, subscribeTabMessages } from '@/shared/utils/browser/tab-sync.utils';
import { useEventCallback } from '../state/useEventCallback';

/** Subscribe to messages on channel. Auto-cleanup. */
export function useMultiTabSync<T = unknown>(
  channelName: string,
  handler: (message: T) => void,
): void {
  // Ghi thẳng vào ref lúc render vi phạm `react-hooks/refs`. `useEventCallback`
  // cho một hàm có identity ổn định (effect chỉ chạy lại khi ĐỔI kênh) nhưng
  // luôn gọi bản `handler` mới nhất — khỏi mở/đóng BroadcastChannel mỗi render.
  const onMessage = useEventCallback(handler as (message: never) => void) as (message: T) => void;

  useEffect(() => subscribeTabMessages<T>(channelName, onMessage), [channelName, onMessage]);
}

/** Get a function to broadcast messages on a channel. */
export function useMultiTabBroadcaster<T = unknown>(channelName: string): (message: T) => void {
  return useCallback((message: T) => postTabMessage(channelName, message), [channelName]);
}
