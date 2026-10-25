import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react-native';
import { AxiosError, type AxiosResponse } from 'axios';
import type { ReactElement, ReactNode } from 'react';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

/** ⚠️ `Screen` gọi `useSafeAreaInsets()` — ném lỗi nếu thiếu provider. */
const SAFE_AREA_METRICS: Metrics = {
  frame: { height: 812, width: 375, x: 0, y: 0 },
  insets: { bottom: 34, left: 0, right: 0, top: 44 },
};

/**
 * Dựng màn xác thực trong test: vùng an toàn + React Query không retry.
 *
 * ⚠️ `render()` của RNTL 14 là BẤT ĐỒNG BỘ — phải `await`. `gcTime: 0` cho cả mutation: mặc định
 * 5 phút, và timer đó giữ tiến trình Jest sống thêm 5 phút sau khi test xong.
 */
export async function renderScreen(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      mutations: { gcTime: 0, retry: false },
      queries: { gcTime: 0, retry: false, staleTime: 0 },
    },
  });
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </SafeAreaProvider>
    );
  }
  return render(ui, { wrapper: Wrapper });
}

/** Lỗi HTTP kiểu BE: `{ error: { code, message } }`. */
export function httpError(
  status: number,
  code: string,
  message = 'msg-tu-be',
  details?: Record<string, unknown>,
): AxiosError {
  const response = {
    data: { error: { code, details, message } },
    status,
  } as unknown as AxiosResponse;
  return new AxiosError('Request failed', 'ERR_BAD_REQUEST', undefined, undefined, response);
}
