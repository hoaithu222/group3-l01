import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react-native';
import type { ReactElement, ReactNode } from 'react';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

/**
 * Đồ dùng chung cho test màn của `members` (p3-04). KHÔNG phải test (`testMatch` chỉ nhận
 * `*.test.tsx`). `jest.mock(...)` PHẢI nằm trong từng file test — babel-jest chỉ hoist
 * chúng trong chính file đó, đặt ở đây là không có tác dụng.
 */

/** ⚠️ `Screen`/`AppBar` gọi `useSafeAreaInsets()` — ném lỗi nếu thiếu provider. */
const METRICS: Metrics = {
  frame: { height: 812, width: 375, x: 0, y: 0 },
  insets: { bottom: 34, left: 0, right: 0, top: 44 },
};

/** ⚠️ `render()` của RNTL 14 là BẤT ĐỒNG BỘ — phải `await`. */
export async function renderWithProviders(ui: ReactElement): Promise<void> {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <SafeAreaProvider initialMetrics={METRICS}>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </SafeAreaProvider>
    );
  }
  await render(ui, { wrapper: Wrapper });
}

/** `isAxiosError()` chỉ kiểm cờ `isAxiosError` — dựng lỗi có hình dạng response mà BE trả. */
export function apiError(
  status: number,
  code: string,
  extra: { details?: Record<string, unknown>; headers?: Record<string, string> } = {},
) {
  return Object.assign(new Error(`HTTP ${status}`), {
    isAxiosError: true,
    response: {
      status,
      data: { error: { code, message: code, details: extra.details } },
      headers: extra.headers ?? {},
    },
  });
}
