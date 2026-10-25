import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, userEvent } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { BoardFilterBar } from '../components/BoardFilterBar';

const METRICS = {
  frame: { height: 812, width: 375, x: 0, y: 0 },
  insets: { bottom: 34, left: 0, right: 0, top: 44 },
};

// Danh sách thành viên chỉ tải khi mở bộ chọn "Người làm" — test này không mở, nên không có request nào.
const queryClient = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retry: false } } });

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <SafeAreaProvider initialMetrics={METRICS}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </SafeAreaProvider>
  );
}

describe('BoardFilterBar', () => {
  it('"Xoá lọc" xoá cả chữ trong ô tìm (ô uncontrolled) chứ không chỉ bộ lọc ở tầng dữ liệu', async () => {
    const handlers = { onPatch: jest.fn(), onQuery: jest.fn(), onReset: jest.fn() };
    const screen = await render(
      <BoardFilterBar chips={{ assigneeId: 'me' }} labels={[]} wsId="w1" {...handlers} />,
      { wrapper: Wrapper },
    );

    await userEvent.type(screen.getByPlaceholderText('Tìm thẻ theo tiêu đề'), 'báo cáo');
    expect(handlers.onQuery).toHaveBeenLastCalledWith('báo cáo');
    // Ô có chữ ⇒ nút ✕ của ô tìm hiện.
    expect(screen.getByLabelText('Xoá nội dung tìm kiếm')).toBeOnTheScreen();

    await userEvent.press(screen.getByText('Xoá lọc'));

    expect(handlers.onReset).toHaveBeenCalledTimes(1);
    // `SearchInputHandle.clear()` đã chạy: ô rỗng ⇒ nút ✕ biến mất.
    expect(screen.queryByLabelText('Xoá nội dung tìm kiếm')).toBeNull();
  });
});
