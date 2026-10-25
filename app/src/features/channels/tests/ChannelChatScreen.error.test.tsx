import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import { ChannelChatScreen } from '../screens/ChannelChatScreen';

/**
 * Tải chi tiết kênh lỗi ⇒ màn có "Thử lại" (không thì người dùng kẹt ở màn trống, chỉ còn cách thoát ra vào lại). Còn
 * "không tìm thấy kênh" (không có lỗi) thì bấm thử lại chẳng ra gì ⇒ KHÔNG hiện nút.
 */
jest.mock('@/features/chat', () => ({
  ChatRoom: () => null,
  useChatScope: () => ({ scopeId: 'ch-1', scopeType: 'CHANNEL' }),
}));
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: () => ({ chId: 'ch-1', wsId: 'ws-1' }),
}));

const mockScope = {
  channel: undefined as unknown,
  error: null as unknown,
  isLoading: false,
  refetch: jest.fn(),
  status: 'joined' as const,
};
jest.mock('../hooks/useChannelScope', () => ({ useChannelScope: () => mockScope }));
jest.mock('../hooks/useChannelAuthors', () => ({ useChannelAuthors: () => undefined }));

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

beforeEach(() => {
  jest.clearAllMocks();
  mockScope.channel = undefined;
  mockScope.error = null;
});

describe('ChannelChatScreen — tải kênh lỗi', () => {
  it('có lỗi ⇒ hiện "Thử lại"; bấm thì tải lại', async () => {
    mockScope.error = new Error('mạng');
    await render(<ChannelChatScreen />, { wrapper: Wrapper });

    await fireEvent.press(screen.getByRole('button', { name: 'Thử lại' }));

    expect(mockScope.refetch).toHaveBeenCalledTimes(1);
  });

  it('không lỗi mà không có kênh (không tìm thấy) ⇒ KHÔNG có nút "Thử lại"', async () => {
    await render(<ChannelChatScreen />, { wrapper: Wrapper });

    expect(screen.getByText('Không tìm thấy kênh này.')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Thử lại' })).not.toBeOnTheScreen();
  });
});
