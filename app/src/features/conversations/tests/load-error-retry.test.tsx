import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import { ConversationInfoScreen } from '../screens/ConversationInfoScreen';
import { ConversationScreen } from '../screens/ConversationScreen';
import { DraftDirectScreen } from '../screens/DraftDirectScreen';

/**
 * Màn tải lỗi phải có "Thử lại" (`docs/rules/ui-components.md`, trạng thái lỗi) — không thì người dùng kẹt ở một màn trống
 * và chỉ còn cách thoát ra vào lại. Cũng phải PHÂN BIỆT: "không tìm thấy" (không có lỗi) thì bấm thử lại chẳng ra gì nên
 * không được hiện nút, kẻo người dùng bấm mãi.
 */
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: () => ({ conversationId: 'c-1', userId: 'u-2', name: 'An' }),
}));
jest.mock('@/features/chat', () => ({
  ChatRoom: () => null,
  chatKeys: { scope: () => ['chat'] },
  useChatScope: () => ({ scopeId: 'c-1', scopeType: 'CONVERSATION' }),
}));

const mockScope = {
  conversation: undefined as unknown,
  error: null as unknown,
  isLoading: false,
  refetch: jest.fn(),
  status: 'joined' as const,
};
jest.mock('../hooks/useConversationScope', () => ({ useConversationScope: () => mockScope }));
jest.mock('../hooks/useReadReceipts', () => ({ useReadReceipts: () => 0 }));
jest.mock('../hooks/useConversationAuthors', () => ({ useConversationAuthors: () => undefined }));
jest.mock('../hooks/useConversationForwardTargets', () => ({
  useConversationForwardTargets: () => undefined,
}));

const mockDetail = {
  data: undefined as unknown,
  error: null as unknown,
  isLoading: false,
  refetch: jest.fn(),
};
jest.mock('../hooks/useConversationDetail', () => ({ useConversationDetail: () => mockDetail }));

const mockDirect = { status: 'error', error: new Error('mạng'), retry: jest.fn() };
jest.mock('../hooks/useDirectConversation', () => ({ useDirectConversation: () => mockDirect }));
jest.mock('../hooks/useDraftDirectSend', () => ({
  useDraftDirectSend: () => ({ error: undefined, send: jest.fn(), sending: false }),
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

beforeEach(() => {
  jest.clearAllMocks();
  mockScope.conversation = undefined;
  mockScope.error = null;
  mockDetail.data = undefined;
  mockDetail.error = null;
});

describe('ConversationScreen — tải hội thoại lỗi', () => {
  it('có lỗi ⇒ hiện "Thử lại"; bấm thì tải lại', async () => {
    mockScope.error = new Error('mạng');
    await render(<ConversationScreen />, { wrapper: Wrapper });

    await fireEvent.press(screen.getByRole('button', { name: 'Thử lại' }));

    expect(mockScope.refetch).toHaveBeenCalledTimes(1);
  });

  it('không có lỗi mà vẫn không có hội thoại (không tìm thấy) ⇒ KHÔNG có nút "Thử lại"', async () => {
    await render(<ConversationScreen />, { wrapper: Wrapper });

    expect(screen.getByText('Không tìm thấy cuộc trò chuyện này.')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Thử lại' })).not.toBeOnTheScreen();
  });
});

describe('ConversationInfoScreen — tải thông tin lỗi', () => {
  it('có lỗi ⇒ hiện "Thử lại"; bấm thì tải lại', async () => {
    mockDetail.error = new Error('mạng');
    await render(<ConversationInfoScreen />, { wrapper: Wrapper });

    await fireEvent.press(screen.getByRole('button', { name: 'Thử lại' }));

    expect(mockDetail.refetch).toHaveBeenCalledTimes(1);
  });

  it('không tìm thấy (không lỗi) ⇒ KHÔNG có nút "Thử lại"', async () => {
    await render(<ConversationInfoScreen />, { wrapper: Wrapper });

    expect(screen.queryByRole('button', { name: 'Thử lại' })).not.toBeOnTheScreen();
  });
});

describe('DraftDirectScreen — tra hội thoại 1-1 lỗi', () => {
  it('hiện "Thử lại"; bấm thì gọi retry của hook', async () => {
    await render(<DraftDirectScreen />, { wrapper: Wrapper });

    await fireEvent.press(screen.getByRole('button', { name: 'Thử lại' }));

    expect(mockDirect.retry).toHaveBeenCalledTimes(1);
  });
});
