import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react-native';
import type { ReactElement, ReactNode } from 'react';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

/**
 * Đồ dùng chung cho test component của nhóm `prejoin/ waiting/ people/ chat/ dialogs/ ended/ mini/` (KHÔNG phải test — `testMatch` chỉ nhận
 * `*.test.tsx`). `Screen`/`AppBar`/`BottomSheet`/`BottomActionBar` gọi `useSafeAreaInsets()` nên phải có provider kèm `initialMetrics`.
 */
const METRICS: Metrics = {
  frame: { height: 812, width: 375, x: 0, y: 0 },
  insets: { bottom: 34, left: 0, right: 0, top: 44 },
};

export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      // gcTime 0: mutation không giữ hẹn giờ 5 phút — thiếu dòng này Jest chạy MỘT file không thoát được.
      mutations: { gcTime: 0, retry: false },
      queries: { gcTime: Infinity, retry: false, staleTime: 0 },
    },
  });
}

/** ⚠️ `render()` của RNTL 14 là BẤT ĐỒNG BỘ — phải `await`. */
export async function renderWithProviders(ui: ReactElement, queryClient: QueryClient = makeQueryClient()) {
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <SafeAreaProvider initialMetrics={METRICS}>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </SafeAreaProvider>
    );
  }
  const result = await render(ui, { wrapper: Wrapper });
  return { ...result, queryClient };
}
