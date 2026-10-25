import type { ReactNode } from 'react';

import { useSessionSync } from '@/features/auth/hooks/useSessionSync';

interface SessionSyncProviderProps {
  children: ReactNode;
}

/**
 * Nghe tab khác báo vòng đời phiên (đăng xuất → dọn phiên tab này; đăng nhập → đối chiếu cookie).
 *
 * Đặt ở tầng PROVIDER, không phải trong guard: tab đang ở trang đăng nhập (ngoài `AuthGuard`)
 * cũng phải nghe được "tab khác vừa đăng nhập". Cần `QueryClientProvider` phía trên vì dọn phiên
 * xoá React Query cache.
 */
export default function SessionSyncProvider({ children }: SessionSyncProviderProps) {
  useSessionSync();
  return <>{children}</>;
}
