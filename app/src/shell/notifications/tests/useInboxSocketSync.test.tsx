import type { InfiniteData } from '@tanstack/react-query';

import { notificationKeys, type InboxPage, type UnreadSummary } from '@/core/notifications';
import { SocketEvent } from '@/core/socket';

import { advance, emit, inbox, inboxItem, setupSync, SUMMARY } from './sync.fixtures';

/**
 * `notification:created` / `notification:read` (p1-07 `app.md` §4.3, §8): huy hiệu Hoạt động tăng/giảm ĐÚNG số mục,
 * `{ all }` đối chiếu server, mục đã đọc không bị đếm hai lần.
 */

jest.mock('@/core/device/device-id', () => ({ getDeviceId: () => Promise.resolve('device-A') }));
jest.mock('@/core/notifications/notifications.setup', () => ({ isViewingScope: () => false }));

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('notification:created', () => {
  it('+1 huy hiệu Hoạt động (nhắc tên tăng cả mentions) và làm mới hộp thư', async () => {
    const { invalidate, queryClient } = await setupSync();
    queryClient.setQueryData(notificationKeys.unreadSummary, SUMMARY);

    await emit(SocketEvent.NOTIFICATION_CREATED, { createdAt: 'x', id: 'n1', kind: 'MENTION' });

    expect(queryClient.getQueryData<UnreadSummary>(notificationKeys.unreadSummary)).toMatchObject({
      activity: { mentions: 2, unread: 3 },
      badgeTotal: 7,
    });
    await advance(1100);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: notificationKeys.inboxAll });
  });

  it('loại không phải nhắc tên: chỉ +1 chưa đọc, mentions giữ nguyên', async () => {
    const { queryClient } = await setupSync();
    queryClient.setQueryData(notificationKeys.unreadSummary, SUMMARY);
    await emit(SocketEvent.NOTIFICATION_CREATED, { createdAt: 'x', id: 'n1', kind: 'THREAD_REPLY' });
    expect(queryClient.getQueryData<UnreadSummary>(notificationKeys.unreadSummary)?.activity).toEqual({
      mentions: 1,
      unread: 3,
    });
  });
});

describe('notification:read', () => {
  it('{ ids } → đặt readAt và hạ huy hiệu ĐÚNG số mục chưa đọc; id đã đọc không đếm', async () => {
    const { queryClient } = await setupSync();
    queryClient.setQueryData(notificationKeys.unreadSummary, SUMMARY);
    const key = notificationKeys.inboxList({ filter: 'all' });
    queryClient.setQueryData(key, inbox([inboxItem('a'), inboxItem('b', '2026-09-21T09:00:00.000Z')]));

    await emit(SocketEvent.NOTIFICATION_READ, { ids: ['a', 'b'] });

    const list = queryClient.getQueryData<InfiniteData<InboxPage>>(key);
    expect(list?.pages[0]?.data.find((i) => i.id === 'a')?.readAt).not.toBeNull();
    expect(queryClient.getQueryData<UnreadSummary>(notificationKeys.unreadSummary)).toMatchObject({
      activity: { unread: 1 },
      badgeTotal: 5,
    });
  });

  it('{ all } → làm mới hộp thư (không biết chính xác mục nào thuộc bộ lọc nào)', async () => {
    const { invalidate } = await setupSync();
    await emit(SocketEvent.NOTIFICATION_READ, {
      all: { before: '2026-09-21T00:00:00.000Z', filter: 'all' },
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: notificationKeys.inboxAll });
  });
});
