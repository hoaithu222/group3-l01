import { render, userEvent } from '@testing-library/react-native';
import { type ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ReadAllConversationsButton } from '../components/ReadAllConversationsButton';

/**
 * "Đánh dấu tất cả đã đọc" nay là MỘT DÒNG có chữ ở đầu danh sách (trước là icon "✓✓" thứ ba trên `AppBar`). Test HÀNH VI: chỉ
 * hiện khi còn hội thoại chưa đọc, nêu rõ con số, và LUÔN hỏi xác nhận trước khi gọi API.
 */
let mockUnread = 3;
jest.mock('@/shell/notifications', () => ({
  useUnreadSummary: () => ({ data: { conversations: { unreadConversations: mockUnread } } }),
}));
const mockMutate = jest.fn();
jest.mock('../hooks/useReadAllConversations', () => ({
  useReadAllConversations: () => ({ mutate: mockMutate }),
}));

const METRICS = {
  frame: { x: 0, y: 0, width: 375, height: 812 },
  insets: { top: 44, left: 0, right: 0, bottom: 34 },
};
const Wrapper = ({ children }: { children: ReactNode }) => (
  <SafeAreaProvider initialMetrics={METRICS}>{children}</SafeAreaProvider>
);

beforeEach(() => {
  mockUnread = 3;
  jest.clearAllMocks();
});

describe('ReadAllConversationsButton', () => {
  it('nêu số cuộc trò chuyện chưa đọc kèm nút có chữ', async () => {
    const screen = await render(<ReadAllConversationsButton />, { wrapper: Wrapper });

    expect(screen.getByText('3 cuộc trò chuyện chưa đọc')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Đánh dấu tất cả cuộc trò chuyện đã đọc' })).toBeOnTheScreen();
  });

  it('không còn hội thoại chưa đọc ⇒ không vẽ gì (không có nút vô nghĩa)', async () => {
    mockUnread = 0;
    const screen = await render(<ReadAllConversationsButton />, { wrapper: Wrapper });

    expect(screen.queryByText(/chưa đọc/)).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('bấm chỉ mở hộp xác nhận; chỉ khi xác nhận mới gọi đánh dấu đã đọc', async () => {
    const screen = await render(<ReadAllConversationsButton />, { wrapper: Wrapper });

    await userEvent.press(screen.getByRole('button', { name: 'Đánh dấu tất cả cuộc trò chuyện đã đọc' }));
    expect(mockMutate).not.toHaveBeenCalled();

    await userEvent.press(await screen.findByText('Đánh dấu đã đọc'));
    expect(mockMutate).toHaveBeenCalledTimes(1);
  });
});
