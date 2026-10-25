import { useSyncExternalStore } from 'react';

import {
  getNetworkSnapshot,
  subscribeNetwork,
  type NetworkSnapshot,
} from '@/core/net/network-state';

/**
 * Trạng thái mạng của máy cho giao diện: `isOnline`, `isInternetReachable`, `type`, `isMetered` (p0-12).
 *
 * ```tsx
 * const { isOnline } = useNetworkStatus();
 * <Button disabled={!isOnline} label={isOnline ? 'Lưu' : 'Kết nối lại để lưu'} … />
 * ```
 *
 * Mọi nơi dùng hook này chia sẻ MỘT đăng ký NetInfo (xem `core/net/network-state.ts`) — thay cho việc mỗi màn tự
 * `NetInfo.addEventListener`. `isOnline` là `true` cho tới khi NetInfo báo chắc chắn ngược lại (không nháy "ngoại tuyến"
 * lúc mở app). Trong render KHÔNG đọc NetInfo trực tiếp: hook đi qua `useSyncExternalStore` nên an toàn với React Compiler.
 */
export function useNetworkStatus(): NetworkSnapshot {
  return useSyncExternalStore(subscribeNetwork, getNetworkSnapshot, getNetworkSnapshot);
}

export type { NetworkSnapshot };
