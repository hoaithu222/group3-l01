import { notificationKeys, type WorkspaceUnread } from '@/core/notifications';
import { SocketEvent } from '@/core/socket';
import { useAuthStore } from '@/shell/store/slices/auth';

import { advance, emit, setupSync } from './sync.fixtures';

/**
 * p1-07 `app.md` §8 "Unit reducer socket": `read:updated` từ máy khác hạ badge; `originDeviceId` trùng bỏ qua; kênh
 * nhận tin mới; nối lại socket. Hộp thư (`notification:*`): `useInboxSocketSync.test.tsx`.
 */

jest.mock('@/core/device/device-id', () => ({ getDeviceId: () => Promise.resolve('device-A') }));
// Registry room của socket không thuộc test này.
jest.mock('@/core/notifications/notifications.setup', () => ({ isViewingScope: () => false }));

beforeEach(() => {
  jest.useFakeTimers();
  useAuthStore.setState({ user: { id: 'me' } as never });
});

afterEach(() => {
  jest.useRealTimers();
  useAuthStore.setState({ user: null });
});

const channelData = (unread: number, lastSeq = 8): WorkspaceUnread => ({
  channels: { 'ch-1': { capped: false, lastReadSeq: 0, lastSeq, mentions: 1, unread } },
  threads: {},
});

describe('read:updated', () => {
  it('đọc kênh ở MÁY KHÁC → hạ chấm kênh ngay và đối chiếu server sau ≤ 1 s (một lần dù dồn dập)', async () => {
    const { invalidate, queryClient } = await setupSync();
    queryClient.setQueryData(notificationKeys.workspaceUnread('ws-1'), channelData(3));

    await emit(SocketEvent.READ_UPDATED, { lastReadSeq: 8, streamId: 'ch-1', streamType: 'CHANNEL' });
    await emit(SocketEvent.READ_UPDATED, { lastReadSeq: 8, streamId: 'ch-1', streamType: 'CHANNEL' });

    expect(
      queryClient.getQueryData<WorkspaceUnread>(notificationKeys.workspaceUnread('ws-1'))?.channels['ch-1'],
    ).toMatchObject({ mentions: 0, unread: 0 });
    expect(invalidate).not.toHaveBeenCalled(); // chưa hết debounce

    await advance(1100);
    const summaryCalls = invalidate.mock.calls.filter(([f]) => f?.queryKey === notificationKeys.unreadSummary);
    expect(summaryCalls).toHaveLength(1);
  });

  it('originDeviceId trùng máy này → BỎ QUA (máy nguồn đã vá cục bộ)', async () => {
    const { invalidate, queryClient } = await setupSync();
    queryClient.setQueryData(notificationKeys.workspaceUnread('ws-1'), channelData(3));

    await emit(SocketEvent.READ_UPDATED, {
      lastReadSeq: 8,
      originDeviceId: 'device-A',
      streamId: 'ch-1',
      streamType: 'CHANNEL',
    });
    await advance(1100);

    expect(
      queryClient.getQueryData<WorkspaceUnread>(notificationKeys.workspaceUnread('ws-1'))?.channels['ch-1']?.unread,
    ).toBe(3);
    expect(invalidate).not.toHaveBeenCalled();
  });
});

describe('unread:summary-changed / channel:activity / connect', () => {
  it('unread:summary-changed → làm mới tóm tắt và số theo workspace (debounce)', async () => {
    const { invalidate } = await setupSync();
    await emit(SocketEvent.UNREAD_SUMMARY_CHANGED, { reason: 'MUTE' });
    await advance(1100);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: notificationKeys.unreadSummary });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: notificationKeys.workspaceUnreadAll });
  });

  it('channel:activity của người khác ở luồng chính → +1 chưa đọc; của MÌNH hoặc trong luồng thì không', async () => {
    const { queryClient } = await setupSync();
    queryClient.setQueryData(notificationKeys.workspaceUnread('ws-1'), channelData(0));
    const unread = () =>
      queryClient.getQueryData<WorkspaceUnread>(notificationKeys.workspaceUnread('ws-1'))?.channels['ch-1']?.unread;

    await emit(SocketEvent.CHANNEL_ACTIVITY, { authorId: 'other', channelId: 'ch-1', seq: 9, workspaceId: 'ws-1' });
    expect(unread()).toBe(1);

    await emit(SocketEvent.CHANNEL_ACTIVITY, { authorId: 'me', channelId: 'ch-1', seq: 10, workspaceId: 'ws-1' });
    await emit(SocketEvent.CHANNEL_ACTIVITY, {
      authorId: 'other',
      channelId: 'ch-1',
      seq: 11,
      threadId: 'root-1',
      workspaceId: 'ws-1',
    });
    expect(unread()).toBe(1);
  });

  it('socket nối lại → đối chiếu lại tóm tắt và hộp thư (có thể đã lỡ sự kiện)', async () => {
    const { invalidate } = await setupSync();
    await emit('connect', undefined);
    await advance(1100);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: notificationKeys.unreadSummary });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: notificationKeys.inboxAll });
  });
});
