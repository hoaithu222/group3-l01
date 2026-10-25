import { QueryClient, QueryClientProvider, type InfiniteData } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { io } from 'socket.io-client';

import type { InboxItem, InboxPage, UnreadSummary } from '@/core/notifications';

import { useReadStateSync } from '../useReadStateSync';

/** Dùng chung cho test đồng bộ socket của p1-07 (`useReadStateSync`, `useInboxSocketSync`). */

export const SUMMARY: UnreadSummary = {
  activity: { mentions: 1, unread: 2 },
  badgeTotal: 6,
  computedAt: '2026-09-21T00:00:00.000Z',
  conversations: { mentions: 0, unreadConversations: 4, unreadMessages: 9 },
  workspaces: [],
};

export function inboxItem(id: string, readAt: string | null = null): InboxItem {
  return {
    actorId: null,
    createdAt: '2026-09-21T10:00:00.000Z',
    id,
    kind: 'MENTION',
    muted: false,
    readAt,
    refs: null,
    scopeId: null,
    scopeType: 'CHANNEL',
    type: 'mention',
    unavailable: false,
    workspaceId: null,
  };
}

export function inbox(items: InboxItem[]): InfiniteData<InboxPage> {
  return {
    pageParams: [undefined],
    pages: [{ data: items, meta: { hasMore: false, limit: 30, nextCursor: null } }],
  };
}

/** Mount `useReadStateSync` (gồm cả `useInboxSocketSync`) với QueryClient thật; bỏ lượt làm mới lúc mount (app active). */
export async function setupSync() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  await renderHook(() => useReadStateSync(), { wrapper });
  await act(async () => Promise.resolve()); // getDeviceId
  invalidate.mockClear();
  return { invalidate, queryClient };
}

interface MockSocket {
  __emitServer: (event: string, payload?: unknown) => void;
}

/** Giả lập server bắn một sự kiện tới client. Tra socket mock ở LÚC GỌI (sau khi `socket.client` đã nạp). */
export async function emit(event: string, payload: unknown) {
  const socket = (io as jest.MockedFunction<typeof io>).mock.results[0]?.value as MockSocket;
  await act(async () => socket.__emitServer(event, payload));
}

export async function advance(ms: number) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
}
