import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react-native';
import type { ReactElement, ReactNode } from 'react';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

/** Đồ dùng chung cho test màn của `meetings`. KHÔNG phải test (`testMatch` chỉ nhận `*.test.tsx`). */

/** ⚠️ `Screen`/`AppBar`/`BottomSheet` gọi `useSafeAreaInsets()` — ném lỗi nếu thiếu provider. */
const METRICS: Metrics = {
  frame: { height: 812, width: 375, x: 0, y: 0 },
  insets: { bottom: 34, left: 0, right: 0, top: 44 },
};

export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      // gcTime 0: mutation không giữ hẹn giờ 5 phút — thiếu dòng này Jest chạy MỘT file (trong tiến trình) không thoát được.
      mutations: { gcTime: 0, retry: false },
      queries: { gcTime: Infinity, retry: false, staleTime: 0 },
    },
  });
}

/** ⚠️ `render()` của RNTL 14 là BẤT ĐỒNG BỘ — phải `await`. */
export async function renderWithProviders(
  ui: ReactElement,
  queryClient: QueryClient = makeQueryClient(),
) {
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

/** Lỗi axios có cấu trúc `{ error: { code, details } }` như BE trả. */
export function apiError(status: number, code: string, details?: unknown) {
  return Object.assign(new Error(`HTTP ${status}`), {
    isAxiosError: true,
    response: { data: { error: { code, details, message: code } }, headers: {}, status },
  });
}
