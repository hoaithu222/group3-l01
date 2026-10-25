import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { useAuthStore } from '@/shell/store/slices/auth';

import { conversationsService } from '../api/conversations.service';
import type { ConversationDetail } from '../api/conversations.types';
import { useConversationAuthors } from '../hooks/useConversationAuthors';

jest.mock('../api/conversations.service', () => ({ conversationsService: { listMembers: jest.fn() } }));
const mockedListMembers = jest.mocked(conversationsService.listMembers);

function conversation(overrides: Partial<ConversationDetail>): ConversationDetail {
  return {
    id: 'c-1',
    kind: 'GROUP',
    peer: null,
    ...overrides,
  } as ConversationDetail;
}

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

function member(userId: string, name: string) {
  return { userId, name, avatarUrl: null, role: 'MEMBER' as const, joinedAt: '2026-09-01T00:00:00.000Z', presence: 'OFFLINE' };
}

describe('useConversationAuthors', () => {
  beforeEach(() => {
    mockedListMembers.mockReset();
    useAuthStore.setState({ user: { id: 'me', email: 'me@x.vn', name: 'Tôi', roles: [], permissions: [] } });
  });

  it('DIRECT ⇒ tra từ `peer` + chính mình, KHÔNG gọi API thành viên (peer đã có sẵn trong chi tiết)', async () => {
    const detail = conversation({
      kind: 'DIRECT',
      peer: { userId: 'u-2', name: 'Trần Thị Bình', avatarUrl: 'https://cdn/b.png', presence: 'ONLINE' },
    });

    const { result } = await renderHook(() => useConversationAuthors(detail), { wrapper: createWrapper() });

    expect(result.current('u-2')).toEqual({ name: 'Trần Thị Bình', avatarUrl: 'https://cdn/b.png' });
    expect(result.current('me')?.name).toBe('Tôi');
    expect(mockedListMembers).not.toHaveBeenCalled();
  });

  it('GROUP ⇒ kéo hết các trang thành viên rồi tra được người ở trang sau', async () => {
    mockedListMembers
      .mockResolvedValueOnce({ data: [member('u-1', 'Nguyễn Văn An')], meta: { nextCursor: 'p2', hasMore: true, limit: 50 } })
      .mockResolvedValueOnce({ data: [member('u-2', 'Trần Thị Bình')], meta: { nextCursor: null, hasMore: false, limit: 50 } });

    const { result } = await renderHook(() => useConversationAuthors(conversation({ kind: 'GROUP' })), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current('u-2')?.name).toBe('Trần Thị Bình'));
    expect(result.current('u-1')?.name).toBe('Nguyễn Văn An');
    expect(mockedListMembers).toHaveBeenNthCalledWith(1, 'c-1', { cursor: undefined, limit: 50, role: undefined });
    expect(mockedListMembers).toHaveBeenNthCalledWith(2, 'c-1', { cursor: 'p2', limit: 50, role: undefined });
  });

  it('chưa có chi tiết hội thoại ⇒ không gọi gì, vẫn tra được chính mình', async () => {
    const { result } = await renderHook(() => useConversationAuthors(undefined), { wrapper: createWrapper() });

    expect(mockedListMembers).not.toHaveBeenCalled();
    expect(result.current('me')?.name).toBe('Tôi');
    expect(result.current('u-la')).toBeUndefined();
  });
});
