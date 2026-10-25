/**
 * @file useNetworkStatus.ts
 * @description Online/offline detection với `wasOffline` flag để trigger sync.
 *
 * Theo dõi kết nối mạng để màn hình không im lặng thất bại khi mất mạng.
 * Phủ ca: mất kết nối client, mất kết nối server, server khởi động lại.
 *
 * Ví dụ:
 *   const { isOnline, wasOffline } = useNetworkStatus();
 *
 *   useEffect(() => {
 *     if (wasOffline && isOnline) {
 *       showToast('info', 'Đã kết nối lại. Đang đồng bộ...');
 *       queryClient.invalidateQueries();
 *     }
 *   }, [wasOffline, isOnline]);
 */
import { useEffect, useState } from 'react';

export interface NetworkStatus {
  /** Current online state (navigator.onLine). */
  isOnline: boolean;
  /** True once user was offline sau khi mount, giữ true tới khi caller reset. */
  wasOffline: boolean;
  /** Timestamp of last transition (ms epoch). */
  lastChangedAt: number | null;
}

const getInitialOnline = (): boolean => {
  if (typeof navigator === 'undefined') return true;
  return navigator.onLine !== false;
};

export function useNetworkStatus(): NetworkStatus {
  const [state, setState] = useState<NetworkStatus>(() => ({
    isOnline: getInitialOnline(),
    wasOffline: false,
    lastChangedAt: null,
  }));

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleOnline = () => {
      setState((prev) => ({
        isOnline: true,
        wasOffline: prev.wasOffline || !prev.isOnline,
        lastChangedAt: Date.now(),
      }));
    };

    const handleOffline = () => {
      setState({
        isOnline: false,
        wasOffline: true,
        lastChangedAt: Date.now(),
      });
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return state;
}
