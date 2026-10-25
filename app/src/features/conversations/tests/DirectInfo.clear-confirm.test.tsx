import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import type { ConversationDetail } from '../api/conversations.types';
import { DirectInfo } from '../components/InfoSections/DirectInfo';

/**
 * "Xoá cuộc trò chuyện" ở thông tin hội thoại 1-1 là thao tác phá huỷ (mất khỏi danh sách phía mình): phải HỎI trước, cùng khuôn
 * với tấm xác nhận của vuốt/nhấn giữ hàng danh sách. Bản cũ gọi thẳng `clear()` khi chạm hàng.
 */
jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() } }));

const mockClear = jest.fn();
jest.mock('../hooks/useMyConversationSettings', () => ({
  useMyConversationSettings: () => ({ clear: mockClear, isPending: false, setNotify: jest.fn() }),
}));
jest.mock('../components/DirectSafetyRows', () => ({ DirectSafetyRows: () => null }));
jest.mock('../components/ConversationNotifySheet', () => ({
  ConversationNotifySheet: () => null,
  currentNotifyLabel: () => 'Mọi tin',
}));

const METRICS: Metrics = {
  frame: { height: 812, width: 375, x: 0, y: 0 },
  insets: { bottom: 34, left: 0, right: 0, top: 44 },
};

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <SafeAreaProvider initialMetrics={METRICS}>
      <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
    </SafeAreaProvider>
  );
}

const direct = {
  id: 'c-1',
  kind: 'DIRECT',
  muted: false,
  notifyMode: 'ALL',
  peer: { avatarUrl: null, name: 'An', presence: 'ONLINE', userId: 'u-2' },
  title: null,
} as unknown as ConversationDetail;

beforeEach(() => jest.clearAllMocks());

describe('DirectInfo — xoá cuộc trò chuyện', () => {
  it('chạm hàng chỉ mở tấm xác nhận, CHƯA xoá', async () => {
    await render(<DirectInfo conversation={direct} />, { wrapper: Wrapper });

    await fireEvent.press(screen.getByRole('button', { name: 'Xoá cuộc trò chuyện' }));

    expect(await screen.findByText('Xoá cuộc trò chuyện ở phía bạn?')).toBeOnTheScreen();
    expect(mockClear).not.toHaveBeenCalled();
  });

  it('chỉ khi bấm "Xoá" trong tấm xác nhận mới xoá; "Huỷ" thì không', async () => {
    await render(<DirectInfo conversation={direct} />, { wrapper: Wrapper });

    await fireEvent.press(screen.getByRole('button', { name: 'Xoá cuộc trò chuyện' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Huỷ' }));
    expect(mockClear).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByRole('button', { name: 'Xoá cuộc trò chuyện' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Xoá' }));

    expect(mockClear).toHaveBeenCalledTimes(1);
  });
});
