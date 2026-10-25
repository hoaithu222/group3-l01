import { act, render } from '@testing-library/react-native';
import type { ReactElement, ReactNode } from 'react';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';

import { makeTestQueryClient } from './hook-wrapper';

/**
 * Đồ dùng chung cho test MÀN của `meeting-room` (KHÔNG phải test). `Screen`/`AppBar`/`BottomSheet` gọi `useSafeAreaInsets()` nên phải có provider
 * kèm `initialMetrics`. ⚠️ `render()` của RNTL 14 là BẤT ĐỒNG BỘ — phải `await`.
 */
const METRICS: Metrics = {
  frame: { height: 812, width: 375, x: 0, y: 0 },
  insets: { bottom: 34, left: 0, right: 0, top: 44 },
};

/** Mọi client tạo trong test được `clear()` sau mỗi test: truy vấn đã gỡ còn hẹn giờ gc (30 s) sẽ giữ tiến trình Jest lại rất lâu. */
const clients: QueryClient[] = [];
afterEach(() => clients.splice(0).forEach((client) => client.clear()));

export async function renderScreen(ui: ReactElement) {
  const queryClient = makeTestQueryClient();
  clients.push(queryClient);
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <SafeAreaProvider initialMetrics={METRICS}>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </SafeAreaProvider>
    );
  }
  const result = await render(ui, { wrapper: Wrapper });
  // `FlatList` (lưới phân trang) cập nhật ô bằng `setTimeout` ~50 ms sau lần vẽ đầu — nhường một nhịp TRONG act để không thành cảnh báo "not wrapped in act".
  await act(async () => new Promise<void>((resolve) => setTimeout(resolve, 80)));
  return { ...result, queryClient };
}
