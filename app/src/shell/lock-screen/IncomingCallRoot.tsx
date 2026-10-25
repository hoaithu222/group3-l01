import { QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { queryClient } from '@/core/config/query-client';
import { LockScreenCallScreen } from '@/features/calls';
import { ToastHost } from '@/shared/ui/feedback/ToastHost';
import { ErrorBoundary } from '@/shell/providers/ErrorBoundary';
import { ThemeProvider } from '@/shell/providers/ThemeProvider';

/**
 * Cây React THỨ HAI của app — root `"IncomingCall"`, chỉ do `IncomingCallActivity` dựng
 * (màn gọi bung trên MÀN KHOÁ, p2-02). Đăng ký ở `index.js` cạnh entry của `expo-router`.
 *
 * ── Vì sao không dùng lại `AppProviders` ────────────────────────────────────────
 * `AppProviders` kéo theo cả vòng đời socket/capabilities/push bootstrap và — quan trọng
 * hơn — `expo-router`. Hai cây điều hướng trong cùng một JS runtime là hỏng. Ở đây chỉ giữ
 * đúng bốn provider mà màn gọi cần:
 *  1. `GestureHandlerRootView` (ngoài cùng, `flex-1`) — nút bấm của `shared/ui` dùng cử chỉ;
 *  2. `SafeAreaProvider` — `Screen`/`ToastHost` gọi `useSafeAreaInsets()`, thiếu là NÉM;
 *  3. `QueryClientProvider` — dùng CHUNG `queryClient` với cây `main` (cùng JS runtime) nên
 *     dữ liệu cuộc gọi không bị tách làm hai bản;
 *  4. `ThemeProvider` + `ErrorBoundary` — màn lỗi cũng cần theme và vùng an toàn.
 *
 * ⛔ KHÔNG `KeyboardProvider` (màn gọi không có ô nhập) và KHÔNG `AppLockBoundary`: bắt mở
 * khoá sinh trắc học trước khi được bấm "Nghe" thì cả tính năng này mất nghĩa.
 */
export function IncomingCallRoot() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider>
            <ErrorBoundary>
              <LockScreenCallScreen />
              <ToastHost />
            </ErrorBoundary>
          </ThemeProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
