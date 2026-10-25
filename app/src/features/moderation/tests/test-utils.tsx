import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react-native';
import type { ReactElement, ReactNode } from 'react';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

/**
 * Đồ dùng chung cho test của `moderation` (p1-08). KHÔNG phải test (`testMatch` chỉ nhận `*.test.ts(x)`).
 * ⚠️ `jest.mock(...)` PHẢI nằm trong từng file test — babel-jest chỉ hoist chúng trong chính file đó.
 */

/** ⚠️ `Screen`/`AppBar`/`BottomSheet` gọi `useSafeAreaInsets()` — ném lỗi nếu thiếu provider + `initialMetrics`. */
const METRICS: Metrics = {
  frame: { height: 812, width: 375, x: 0, y: 0 },
  insets: { bottom: 34, left: 0, right: 0, top: 44 },
};

/**
 * ⚠️ `gcTime: Infinity` cho CẢ mutation: mặc định 5 phút, và timer dọn cache của mutation đã xong giữ tiến trình
 * Jest sống thêm 5 phút sau khi test chạy xong ("Jest did not exit one second after the test run").
 */
export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } },
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
  await render(ui, { wrapper: Wrapper });
  return { queryClient };
}

/** `isAxiosError()` chỉ kiểm cờ `isAxiosError` — dựng lỗi có ĐÚNG hình dạng thân lỗi mà BE trả (`{ error: { code, details } }`). */
export function apiError(status: number, code: string, details?: Record<string, unknown>) {
  return Object.assign(new Error(`HTTP ${String(status)}`), {
    isAxiosError: true,
    response: { status, data: { success: false, error: { code, message: code, details } }, headers: {} },
  });
}

/** Bọc thân thành công của BE: `{ success, message, data, timestamp }` (+ `meta` cho danh sách cursor). */
export function envelope<T>(data: T, meta?: Record<string, unknown>, status = 200) {
  return { status, data: { success: true, message: 'ok', data, ...(meta ? { meta } : {}), timestamp: '2026-09-19T00:00:00.000Z' } };
}
