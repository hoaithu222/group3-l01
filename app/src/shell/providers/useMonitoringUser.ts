import { useEffect } from 'react';

import { setMonitoringUser } from '@/core/monitoring';
import { selectUserId, useAuthStore } from '@/shell/store/slices/auth';

/**
 * Gắn `id` người dùng đăng nhập vào Sentry (p0-11 app.md §4) — CHỈ `id`, không email/tên; gỡ (`null`) khi đăng xuất/đổi tài khoản.
 * Phiên chết theo đường KHÁC (refresh 401, socket bị từ chối) thì `core/monitoring` tự gỡ qua `onSessionEnded` — hook này lo đường vào. No-op khi chưa bật Sentry.
 */
export function useMonitoringUser(): void {
  const userId = useAuthStore(selectUserId);
  useEffect(() => {
    setMonitoringUser(userId ? { id: userId } : null);
  }, [userId]);
}
