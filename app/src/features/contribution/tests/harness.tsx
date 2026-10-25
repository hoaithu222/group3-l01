import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react-native';
import { AxiosError } from 'axios';
import type { ReactElement, ReactNode } from 'react';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

/** ⚠️ `Screen`/`BottomSheet` gọi `useSafeAreaInsets()` — ném lỗi nếu thiếu provider. */
const METRICS: Metrics = {
  frame: { height: 812, width: 375, x: 0, y: 0 },
  insets: { bottom: 34, left: 0, right: 0, top: 44 },
};

/**
 * Dựng UI trong test: vùng an toàn + React Query không retry. `gcTime: 0` cho cả mutation — mặc định 5 phút, và timer đó giữ tiến trình Jest sống
 * thêm 5 phút sau khi test xong. `render()` của RNTL 14 là BẤT ĐỒNG BỘ — phải `await`.
 */
export function makeClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { mutations: { gcTime: 0, retry: false }, queries: { gcTime: 0, retry: false, staleTime: 0 } },
  });
}

export async function renderWithClient(ui: ReactElement, client: QueryClient = makeClient()) {
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <SafeAreaProvider initialMetrics={METRICS}>
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      </SafeAreaProvider>
    );
  }
  const screen = await render(ui, { wrapper: Wrapper });
  return { client, screen };
}

/** Lỗi HTTP đúng dạng `{ error: { code, message, details } }` mà interceptor/`toErrorMessage` đọc. */
export function httpError(status: number, code: string, message = 'Câu của server', details?: unknown): AxiosError {
  return new AxiosError('Request failed', 'ERR_BAD_REQUEST', undefined, undefined, {
    config: {} as never,
    data: { error: { code, details, message } },
    headers: {},
    status,
    statusText: '',
  });
}
