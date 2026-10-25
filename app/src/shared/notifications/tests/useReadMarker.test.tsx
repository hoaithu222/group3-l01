import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { notificationKeys, readStateService, type WorkspaceUnread } from '@/core/notifications';

import { READ_MARKER_DEBOUNCE_MS } from '../notifications.constants';
import { useReadMarker } from '../useReadMarker';

/**
 * p1-07 `app.md` §8 "Unit useReadMarker": không gửi khi background/blur; debounce; không gửi seq nhỏ hơn; flush khi blur.
 * ⛔ Đây là hành vi "sai thì im lặng": gửi nhầm lúc app ở nền = đánh dấu đã đọc tin người dùng chưa thấy (NT-02).
 */

let mockFocused = true;
let mockAppState = 'active';
jest.mock('expo-router', () => ({ useIsFocused: () => mockFocused }));
jest.mock('@/shared/hooks/useAppActive', () => ({ useAppActive: () => mockAppState }));
jest.mock('@/core/device/device-id', () => ({ getDeviceId: () => Promise.resolve('device-A') }));

const markSpy = jest.spyOn(readStateService, 'mark');

async function setup(options: Partial<Parameters<typeof useReadMarker>[0]> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const hook = await renderHook(
    (props: Parameters<typeof useReadMarker>[0]) => useReadMarker(props),
    { initialProps: { streamId: 'conv-1', streamType: 'CONVERSATION' as const, ...options }, wrapper },
  );
  // `getDeviceId()` (promise) phải xong trước khi gửi — giá trị nằm trong `ref`.
  await act(async () => Promise.resolve());
  return { hook, queryClient };
}

async function flushDebounce() {
  await act(async () => {
    jest.advanceTimersByTime(READ_MARKER_DEBOUNCE_MS + 10);
  });
}

beforeEach(() => {
  jest.useFakeTimers();
  mockFocused = true;
  mockAppState = 'active';
  markSpy.mockReset().mockImplementation((payload) =>
    Promise.resolve({ changed: true, lastReadSeq: payload.lastReadSeq, streamId: payload.streamId, streamType: payload.streamType }),
  );
});

afterEach(() => {
  jest.useRealTimers();
});

describe('useReadMarker', () => {
  it('gộp nhiều lần hiển thị trong 1 giây thành MỘT lần gửi, với seq lớn nhất', async () => {
    const { hook } = await setup();

    hook.result.current.onVisibleMaxSeq(5);
    hook.result.current.onVisibleMaxSeq(9);
    hook.result.current.onVisibleMaxSeq(7); // nhỏ hơn 9 → bỏ
    expect(markSpy).not.toHaveBeenCalled();

    await flushDebounce();

    expect(markSpy).toHaveBeenCalledTimes(1);
    expect(markSpy).toHaveBeenCalledWith({
      deviceId: 'device-A',
      lastReadSeq: 9,
      streamId: 'conv-1',
      streamType: 'CONVERSATION',
    });
  });

  it('KHÔNG gửi khi màn đang blur (đã rời khỏi màn) hay app ở nền — nhận tin ≠ đã đọc', async () => {
    mockFocused = false;
    const blurred = await setup();
    blurred.hook.result.current.onVisibleMaxSeq(5);
    await flushDebounce();
    expect(markSpy).not.toHaveBeenCalled();
    await blurred.hook.unmount();

    mockFocused = true;
    mockAppState = 'background';
    const background = await setup();
    background.hook.result.current.onVisibleMaxSeq(5);
    await flushDebounce();
    expect(markSpy).not.toHaveBeenCalled();
  });

  it('không gửi lại tin cũ hơn mốc ĐÃ GỬI hay mốc đã biết (chỉ tăng)', async () => {
    const { hook } = await setup({ knownLastReadSeq: 10 });

    hook.result.current.onVisibleMaxSeq(8); // ≤ mốc biết
    await flushDebounce();
    expect(markSpy).not.toHaveBeenCalled();

    hook.result.current.onVisibleMaxSeq(12);
    await flushDebounce();
    expect(markSpy).toHaveBeenCalledTimes(1);

    hook.result.current.onVisibleMaxSeq(12); // đã gửi
    hook.result.current.onVisibleMaxSeq(11);
    await flushDebounce();
    expect(markSpy).toHaveBeenCalledTimes(1);
  });

  it('rời màn (blur) → gửi NGAY phần đang chờ, không đợi debounce', async () => {
    const { hook } = await setup();
    hook.result.current.onVisibleMaxSeq(6);
    expect(markSpy).not.toHaveBeenCalled();

    mockFocused = false;
    await hook.rerender({ streamId: 'conv-1', streamType: 'CONVERSATION' });

    expect(markSpy).toHaveBeenCalledTimes(1);
    expect(markSpy).toHaveBeenCalledWith(expect.objectContaining({ lastReadSeq: 6 }));
  });

  it('unmount cũng gửi nốt phần đang chờ', async () => {
    const { hook } = await setup();
    hook.result.current.onVisibleMaxSeq(4);
    await hook.unmount();
    expect(markSpy).toHaveBeenCalledWith(expect.objectContaining({ lastReadSeq: 4 }));
  });

  it('server nhận → gọi onMarked; kênh: vá số chưa đọc của mọi workspace đang cache', async () => {
    const onMarked = jest.fn();
    const { hook, queryClient } = await setup({ onMarked, streamId: 'ch-1', streamType: 'CHANNEL' });
    queryClient.setQueryData<WorkspaceUnread>(notificationKeys.workspaceUnread('ws-1'), {
      channels: { 'ch-1': { capped: false, lastReadSeq: 5, lastSeq: 9, mentions: 1, unread: 4 } },
      threads: {},
    });

    hook.result.current.onVisibleMaxSeq(9);
    await flushDebounce();

    expect(onMarked).toHaveBeenCalledWith(expect.objectContaining({ lastReadSeq: 9, streamType: 'CHANNEL' }));
    expect(
      queryClient.getQueryData<WorkspaceUnread>(notificationKeys.workspaceUnread('ws-1'))?.channels['ch-1'],
    ).toMatchObject({ mentions: 0, unread: 0 });
  });

  it('luồng: hạ chấm "N mới" của ĐÚNG luồng theo Thread.id đã chuẩn hoá — client gửi id tin gốc, server trả Thread.id', async () => {
    markSpy.mockImplementation((payload) =>
      Promise.resolve({ changed: true, lastReadSeq: payload.lastReadSeq, streamId: 'thread-rec-1', streamType: payload.streamType }),
    );
    const { hook, queryClient } = await setup({ streamId: 'root-msg-1', streamType: 'THREAD' });
    queryClient.setQueryData<WorkspaceUnread>(notificationKeys.workspaceUnread('ws-1'), {
      channels: {},
      threads: {
        'thread-rec-1': { channelId: 'ch-1', lastReadSeq: 0, lastSeq: 3, unread: 3 },
        'thread-rec-2': { channelId: 'ch-1', lastReadSeq: 0, lastSeq: 1, unread: 1 },
      },
    });

    hook.result.current.onVisibleMaxSeq(7);
    await flushDebounce();

    expect(queryClient.getQueryData<WorkspaceUnread>(notificationKeys.workspaceUnread('ws-1'))?.threads).toEqual({
      'thread-rec-2': { channelId: 'ch-1', lastReadSeq: 0, lastSeq: 1, unread: 1 },
    });
  });

  it('luồng mà server báo không đổi (changed=false — máy khác đã đọc tới đó) → KHÔNG tự hạ chấm, chờ số chuẩn của server', async () => {
    markSpy.mockImplementation((payload) =>
      Promise.resolve({ changed: false, lastReadSeq: payload.lastReadSeq, streamId: 'thread-rec-1', streamType: payload.streamType }),
    );
    const { hook, queryClient } = await setup({ streamId: 'thread-rec-1', streamType: 'THREAD' });
    const before: WorkspaceUnread = {
      channels: {},
      threads: { 'thread-rec-1': { channelId: 'ch-1', lastReadSeq: 0, lastSeq: 3, unread: 3 } },
    };
    queryClient.setQueryData<WorkspaceUnread>(notificationKeys.workspaceUnread('ws-1'), before);

    hook.result.current.onVisibleMaxSeq(2);
    await flushDebounce();

    expect(queryClient.getQueryData<WorkspaceUnread>(notificationKeys.workspaceUnread('ws-1'))).toBe(before);
  });

  it('lỗi (404 mất quyền / 429) bị nuốt — không ném, và lần hiển thị sau thử lại được', async () => {
    markSpy.mockRejectedValueOnce(new Error('429'));
    const { hook } = await setup();

    hook.result.current.onVisibleMaxSeq(3);
    await flushDebounce();
    expect(markSpy).toHaveBeenCalledTimes(1);

    hook.result.current.onVisibleMaxSeq(3);
    await flushDebounce();
    expect(markSpy).toHaveBeenCalledTimes(2);
  });

  it('enabled=false → không bao giờ gửi', async () => {
    const { hook } = await setup({ enabled: false });
    hook.result.current.onVisibleMaxSeq(5);
    await flushDebounce();
    expect(markSpy).not.toHaveBeenCalled();
  });
});
