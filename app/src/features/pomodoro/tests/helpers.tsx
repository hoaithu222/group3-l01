import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render } from '@testing-library/react-native';
import type { ReactElement, ReactNode } from 'react';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';
import { io } from 'socket.io-client';

import '@/core/socket';

/** Đồ dùng chung cho test `pomodoro`. KHÔNG phải test (`testMatch` chỉ nhận `*.test.ts(x)`). */

/** ⚠️ `Screen`/`AppBar`/`BottomSheet` gọi `useSafeAreaInsets()` — ném lỗi nếu thiếu provider. */
const METRICS: Metrics = {
  frame: { height: 812, width: 375, x: 0, y: 0 },
  insets: { bottom: 34, left: 0, right: 0, top: 44 },
};

export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { mutations: { gcTime: 0, retry: false }, queries: { gcTime: Infinity, retry: false, staleTime: 0 } },
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

interface MockSocket {
  __emitServer: (event: string, payload?: unknown) => void;
}
const mockSocket = (io as jest.MockedFunction<typeof io>).mock.results[0]?.value as MockSocket;

/** Server bắn một sự kiện; chờ React Query gom thông báo (setTimeout 0) TRONG `act` để không nổ cảnh báo act về sau. */
export async function emitServer(event: string, payload: unknown): Promise<void> {
  await act(async () => {
    mockSocket.__emitServer(event, payload);
    await new Promise((resolve) => setTimeout(resolve, 5));
  });
}
