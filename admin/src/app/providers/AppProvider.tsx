import type { ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/core/config';
import { AppErrorBoundary } from '@/core/monitoring';
import DisplayProvider from './DisplayProvider';
import SessionSyncProvider from './SessionSyncProvider';
import SocketProvider from './SocketProvider';
import ThemeProvider from './ThemeProvider';
import { useMonitoringUser } from './useMonitoringUser';

interface AppProviderProps {
  children: ReactNode;
}

/**
 * Một provider duy nhất: [AppErrorBoundary] → QueryClient → SessionSync → Socket → Theme → Display.
 * `AppErrorBoundary` (p0-11) ngoài cùng: lỗi render ở tầng provider hiện trang lỗi thay vì màn trắng và được báo lên Sentry (no-op khi chưa bật).
 * Dùng ở main.tsx để bọc toàn bộ app.
 *
 * `SocketProvider` cần `useQueryClient()` (invalidate lúc `permission:revoked`)
 * nên phải nằm TRONG `QueryClientProvider`; nó đặt TRƯỚC `ThemeProvider` vì
 * vòng đời socket đi theo phiên đăng nhập — không phụ thuộc theme/display.
 *
 * `SessionSyncProvider` (đăng xuất/đăng nhập ở tab khác) đứng NGOÀI `SocketProvider`: dọn phiên
 * đổi `status`, và socket tự ngắt theo `status` đó.
 *
 * `DisplayProvider` nằm TRONG `ThemeProvider` vì ThemeProvider đọc display store
 * để quyết định class `dark` (TV ép dark) — thứ tự này giữ luồng phụ thuộc một chiều.
 */
export default function AppProvider({ children }: AppProviderProps) {
  useMonitoringUser();
  return (
    <AppErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <SessionSyncProvider>
          <SocketProvider>
            <ThemeProvider>
              <DisplayProvider>{children}</DisplayProvider>
            </ThemeProvider>
          </SocketProvider>
        </SessionSyncProvider>
      </QueryClientProvider>
    </AppErrorBoundary>
  );
}
