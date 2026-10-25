import { QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { apiClient } from '@/core/api/client';
import { useBlockedUsersStore } from '@/shared/stores/blocked-users.store';
import { useAuthStore } from '@/shell/store/slices/auth';

import { moderationKeys } from '../api/moderation.keys';
import type { BlockUpdatedPayload } from '../api/moderation.types';
import { useBlockedSync } from '../hooks/useBlockedSync';
import { envelope, makeQueryClient } from './test-utils';

/**
 * `useBlockedSync` (p1-08 #8, BLOCK-05): nạp `useBlockedIds` từ `GET /me/blocks` (`meta.allIds`) và giữ nó khớp
 * `block:updated` — sự kiện CHỈ tới người chặn (mọi thiết bị của họ). Áp dụng theo tập id nên sự kiện tới lặp
 * hay tới trước lượt tải đều vô hại.
 */

jest.mock('@/core/config/env.config', () => {
  const actual = jest.requireActual<{ appConfig: Record<string, unknown> }>('@/core/config/env.config');
  return { ...actual, appConfig: { ...actual.appConfig, authEnabled: true } };
});

let mockBlockHandler: ((payload: BlockUpdatedPayload) => void) | undefined;
const mockSocketOn = jest.fn();
const mockSocketOff = jest.fn();

jest.mock('@/core/api/client', () => ({ apiClient: { get: jest.fn() } }));
jest.mock('@/core/socket', () => ({
  SocketEvent: { BLOCK_UPDATED: 'block:updated' },
  socket: { on: (...args: unknown[]) => mockSocketOn(...args), off: (...args: unknown[]) => mockSocketOff(...args) },
  useSocketEvent: (_event: string, handler: (payload: BlockUpdatedPayload) => void) => {
    mockBlockHandler = handler;
  },
}));
let mockCommunication: boolean | undefined = true;
jest.mock('@/shell/capabilities', () => ({ useFeature: () => mockCommunication }));

const get = jest.mocked(apiClient.get);

function blocksPage(allIds: string[]) {
  return envelope(
    allIds.map((userId) => ({ userId, name: userId, avatarUrl: null, blockedAt: '2026-09-19T00:00:00.000Z' })),
    { nextCursor: null, hasMore: false, limit: 50, allIds },
  );
}

async function setup() {
  const queryClient = makeQueryClient();
  const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  await renderHook(() => useBlockedSync(), { wrapper });
  return { queryClient, invalidate };
}

describe('useBlockedSync', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockBlockHandler = undefined;
    mockCommunication = true;
    useAuthStore.setState({ status: 'authenticated' });
    useBlockedUsersStore.getState().reset();
  });

  it('tải GET /me/blocks và nạp meta.allIds vào store (không phải tải hết các trang)', async () => {
    get.mockResolvedValue(blocksPage(['u-1', 'u-2']));
    await setup();

    await waitFor(() => expect(useBlockedUsersStore.getState().hydrated).toBe(true));
    expect([...useBlockedUsersStore.getState().ids].sort()).toEqual(['u-1', 'u-2']);
    expect(get).toHaveBeenCalledWith('/me/blocks', { params: { cursor: undefined, limit: 50 }, skipErrorToast: true });
  });

  it('block:updated { added } ⇒ id vào store NGAY và danh sách được làm mới; { removed } ⇒ id ra khỏi store', async () => {
    get.mockResolvedValue(blocksPage([]));
    const { invalidate } = await setup();
    await waitFor(() => expect(useBlockedUsersStore.getState().hydrated).toBe(true));

    await act(async () => {
      mockBlockHandler?.({ v: 1, added: 'u-7' });
    });
    expect(useBlockedUsersStore.getState().ids.has('u-7')).toBe(true);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: moderationKeys.blocks });

    await act(async () => {
      mockBlockHandler?.({ v: 1, removed: 'u-7' });
    });
    expect(useBlockedUsersStore.getState().ids.has('u-7')).toBe(false);
  });

  it('sự kiện tới LẶP (outbox at-least-once) là vô hại — cùng một tập', async () => {
    get.mockResolvedValue(blocksPage([]));
    await setup();
    await waitFor(() => expect(useBlockedUsersStore.getState().hydrated).toBe(true));

    await act(async () => {
      mockBlockHandler?.({ added: 'u-7' });
      mockBlockHandler?.({ added: 'u-7' });
    });
    expect([...useBlockedUsersStore.getState().ids]).toEqual(['u-7']);
  });

  it('kết nối lại socket ⇒ làm mới (đã lỡ sự kiện lúc mất mạng)', async () => {
    get.mockResolvedValue(blocksPage([]));
    const { invalidate } = await setup();
    await waitFor(() => expect(useBlockedUsersStore.getState().hydrated).toBe(true));

    const onConnect = mockSocketOn.mock.calls.find(([event]) => event === 'connect')?.[1] as (() => void) | undefined;
    expect(onConnect).toBeDefined();
    invalidate.mockClear();
    onConnect?.();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: moderationKeys.blocks });
  });

  it('cờ communication TẮT ⇒ không gọi API', async () => {
    mockCommunication = false;
    await setup();
    expect(get).not.toHaveBeenCalled();
  });

  it('CHƯA đăng nhập ⇒ không gọi API dù cờ chưa biết (undefined) — không bắn GET /me/blocks không token; đăng nhập xong mới tải', async () => {
    // Lỗi thật: lúc chưa đăng nhập capabilities bị tắt nên cờ luôn `undefined`, hook cũ coi đó là "cứ tải" ⇒ 401 AUTH_002.
    mockCommunication = undefined;
    useAuthStore.setState({ status: 'anonymous' });
    get.mockResolvedValue(blocksPage(['u-1']));
    await setup();
    expect(get).not.toHaveBeenCalled();

    await act(async () => {
      useAuthStore.setState({ status: 'authenticated' });
    });
    await waitFor(() => expect(useBlockedUsersStore.getState().hydrated).toBe(true));
    expect(get).toHaveBeenCalledTimes(1);
  });
});
