import { useEffect } from 'react';

import { useAuthStore } from '@/app/store';
import { setMonitoringUser } from '@/core/monitoring';

/**
 * Gắn `id` người dùng đăng nhập vào Sentry (p0-11 admin.md §2) và gỡ khi đăng xuất/hết phiên. CHỈ `id` — không email/tên. No-op khi chưa bật Sentry.
 * Chọn theo `user?.id` (chuỗi) nên chỉ chạy lại khi đổi người, không phải mỗi lần store đổi.
 */
export function useMonitoringUser(): void {
  const userId = useAuthStore((state) => state.user?.id ?? null);
  useEffect(() => {
    setMonitoringUser(userId ? { id: userId } : null);
  }, [userId]);
}
