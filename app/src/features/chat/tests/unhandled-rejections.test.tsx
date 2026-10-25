import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import type { ChatScopeRef } from '../api/chat.types';
import { useChatRoomSocket } from '../hooks/useChatRoomSocket';
import { useComposerRestore } from '../hooks/useComposerRestore';
import { useOutboxStore } from '../store/outbox.store';

/**
 * Mất mạng/server chập chờn KHÔNG được sinh Promise reject vô chủ: RN 0.86 ghi `console.error("Uncaught (in promise…)")` cho nó,
 * bản dev hiện thanh LogBox đỏ nằm đè lên thanh tab (người dùng báo là "thanh trắng có dấu !"). jest-circus làm FAIL bài test khi có
 * `unhandledRejection`, nên chỉ cần chạy hai đường đó với API reject rồi đợi vài nhịp — không nổ là đã bắt đúng.
 */
const mockRoomResyncHandlers: (() => void)[] = [];
jest.mock('@/core/socket', () => ({
  onRoomResync: (handler: () => void) => {
    mockRoomResyncHandlers.push(handler);
    return () => undefined;
  },
  scopeKeyOf: (type: string, id: string) => `${type}:${id}`,
  SocketEvent: new Proxy({}, { get: (_t, key) => String(key) }),
  useRoomSubscription: () => ({ status: 'joined' }),
  useSocketEvent: () => undefined,
}));
jest.mock('@/shell/store/slices/auth', () => ({
  useAuthStore: (selector: (s: { user: { id: string } }) => unknown) => selector({ user: { id: 'u-me' } }),
}));

const mockList = jest.fn();
jest.mock('../api/chat.service', () => ({ chatService: { list: (...args: unknown[]) => mockList(...args) } }));

const scope: ChatScopeRef = { scopeId: 'c-1', scopeType: 'CONVERSATION' };

function wrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

/** Đủ vài nhịp macrotask để một Promise reject vô chủ kịp bị Node báo `unhandledRejection`. */
const flush = async (): Promise<void> => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
};

beforeEach(() => {
  jest.clearAllMocks();
  mockRoomResyncHandlers.length = 0;
  mockList.mockRejectedValue(new Error('Network Error'));
});

describe('gap-fill khi socket vừa nối lại', () => {
  it('API reject ⇒ được bắt, và cache tin nhắn được đánh dấu cũ để tự tải lại (không Promise reject vô chủ)', async () => {
    const client = new QueryClient();
    const invalidate = jest.spyOn(client, 'invalidateQueries');
    await renderHook(() => useChatRoomSocket(scope), { wrapper: wrapper(client) });

    expect(mockRoomResyncHandlers).toHaveLength(1);
    mockRoomResyncHandlers[0]?.();
    await flush();

    expect(mockList).toHaveBeenCalled();
    expect(invalidate).toHaveBeenCalled();
  });
});

describe('"Sửa" một tin gửi thất bại khi đang mất mạng', () => {
  it('bước xác nhận "server chưa nhận" reject ⇒ bị bắt; bản FAILED và nháp KHÔNG bị đụng (bấm lại được khi có mạng)', async () => {
    useOutboxStore.getState().add('CONVERSATION:c-1', {
      autoRetried: true,
      clientMessageId: 'client-1',
      content: 'Xin chào',
      createdAtLocal: '2026-09-26T00:00:00.000Z',
      failMessage: 'Lỗi kết nối',
      scope,
      status: 'FAILED',
    });
    const client = new QueryClient();
    const { result } = await renderHook(() => useComposerRestore(scope), { wrapper: wrapper(client) });

    await act(async () => {
      result.current.editPending('client-1');
    });
    await flush();

    expect(result.current.draftRestoreNonce).toBe(0);
    expect(mockList).toHaveBeenCalled();
    expect(useOutboxStore.getState().byScope['CONVERSATION:c-1']?.[0]?.status).toBe('FAILED');
  });
});
