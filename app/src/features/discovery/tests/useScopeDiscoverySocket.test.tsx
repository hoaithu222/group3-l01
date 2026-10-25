import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { io } from 'socket.io-client';

import { SocketEvent } from '@/core/socket';

import { discoveryKeys } from '../api/discovery.keys';
import { useScopeDiscoverySocket } from '../hooks/useScopeDiscoverySocket';

/**
 * Cache ghim/kết quả tìm chứa NỘI DUNG tin — mất quyền phải xoá khỏi bộ nhớ (app.md p1-09 §4), và `pin:updated` chỉ làm
 * mới đúng phạm vi đang mở.
 */
interface MockSocket {
  __emitServer: (event: string, payload?: unknown) => void;
}
const mockSocket = (io as jest.MockedFunction<typeof io>).mock.results[0]?.value as MockSocket;

const CH = { scopeType: 'CHANNEL', scopeId: 'ch-1' } as const;
const CV = { scopeType: 'CONVERSATION', scopeId: 'cv-1' } as const;

function setup(scope: typeof CH | typeof CV) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  queryClient.setQueryData(discoveryKeys.pins(scope), { pages: [], pageParams: [] });
  queryClient.setQueryData(discoveryKeys.search(scope, { q: 'abc' }), { pages: [], pageParams: [] });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, wrapper, scope };
}

const has = (queryClient: QueryClient, key: readonly unknown[]) => queryClient.getQueryData(key) !== undefined;

describe('useScopeDiscoverySocket', () => {
  it('channel:revoked ĐÚNG kênh → xoá cache ghim + kết quả tìm; kênh khác thì giữ', async () => {
    const { queryClient, scope, wrapper } = setup(CH);
    await renderHook(() => useScopeDiscoverySocket(scope), { wrapper });

    await act(async () => mockSocket.__emitServer(SocketEvent.CHANNEL_REVOKED, { channelId: 'ch-khac', workspaceId: 'ws' }));
    expect(has(queryClient, discoveryKeys.pins(scope))).toBe(true);

    await act(async () => mockSocket.__emitServer(SocketEvent.CHANNEL_REVOKED, { channelId: 'ch-1', workspaceId: 'ws' }));
    expect(has(queryClient, discoveryKeys.pins(scope))).toBe(false);
    expect(has(queryClient, discoveryKeys.search(scope, { q: 'abc' }))).toBe(false);
  });

  it('conversation:removed ĐÚNG hội thoại → xoá cache; sự kiện của kênh không đụng tới hội thoại', async () => {
    const { queryClient, scope, wrapper } = setup(CV);
    await renderHook(() => useScopeDiscoverySocket(scope), { wrapper });

    await act(async () => mockSocket.__emitServer(SocketEvent.CHANNEL_REVOKED, { channelId: 'cv-1', workspaceId: 'ws' }));
    expect(has(queryClient, discoveryKeys.pins(scope))).toBe(true);

    await act(async () => mockSocket.__emitServer(SocketEvent.CONVERSATION_REMOVED, { conversationId: 'cv-1' }));
    expect(has(queryClient, discoveryKeys.pins(scope))).toBe(false);
    expect(has(queryClient, discoveryKeys.search(scope, { q: 'abc' }))).toBe(false);
  });

  it('pin:updated đúng phạm vi → invalidate danh sách ghim; phạm vi khác thì không', async () => {
    const { queryClient, scope, wrapper } = setup(CH);
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
    await renderHook(() => useScopeDiscoverySocket(scope), { wrapper });

    await act(async () =>
      mockSocket.__emitServer(SocketEvent.PIN_UPDATED, { messageId: 'm', scopeType: 'CHANNEL', scopeId: 'ch-khac', pinned: true }),
    );
    expect(invalidate).not.toHaveBeenCalled();

    await act(async () =>
      mockSocket.__emitServer(SocketEvent.PIN_UPDATED, { messageId: 'm', scopeType: 'CHANNEL', scopeId: 'ch-1', pinned: true }),
    );
    expect(invalidate).toHaveBeenCalledWith({ queryKey: discoveryKeys.pins(scope) });
  });
});
