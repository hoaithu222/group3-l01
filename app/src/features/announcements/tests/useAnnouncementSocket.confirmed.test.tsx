import { act, renderHook } from '@testing-library/react-native';

import { SocketEvent } from '@/core/socket';

import { announcementKeys } from '../api/announcements.keys';
import type { ReceiptsPage } from '../api/announcements.types';
import { useAnnouncementSocket } from '../hooks/useAnnouncementSocket';
import { makeView, receiptsPage } from './fixtures';
import { emit, LIST_KEY, readList, setupSocketHook } from './socket-harness';

/**
 * `announcement:confirmed` (be.md p5-04 §6, tới `user:{người yêu cầu}`): vá `confirmedCount` ở danh sách kênh lẫn `meta` của danh
 * sách xác nhận đang mở, rồi gộp việc tải lại danh sách người. Mọi sự kiện đều phải khớp `channelId` của phòng đang mở.
 */
const CONFIRMED = { channelId: 'ch-1', confirmedCount: 13, messageId: 'm-1' };

describe('announcement:confirmed (người yêu cầu nhận)', () => {
  it('vá `confirmedCount` của đúng dòng trong danh sách kênh', async () => {
    const { queryClient, wrapper } = setupSocketHook([
      makeView({ confirmedCount: 12 }),
      makeView({ confirmedCount: 1, messageId: 'm-2' }),
    ]);
    await renderHook(() => useAnnouncementSocket('ch-1'), { wrapper });

    await emit(SocketEvent.ANNOUNCEMENT_CONFIRMED, CONFIRMED);

    expect(readList(queryClient)?.map((v) => [v.messageId, v.confirmedCount])).toEqual([
      ['m-1', 13],
      ['m-2', 1],
    ]);
  });

  it('vá luôn `meta.confirmedCount` của danh sách xác nhận đang mở (cả hai tab) và hẹn tải lại danh sách người', async () => {
    jest.useFakeTimers();
    try {
      const { queryClient, wrapper } = setupSocketHook();
      const data = { pageParams: [undefined], pages: [receiptsPage([])] as ReceiptsPage[] };
      queryClient.setQueryData(announcementKeys.receipts('m-1', 'confirmed'), data);
      queryClient.setQueryData(announcementKeys.receipts('m-1', 'pending'), data);
      const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
      await renderHook(() => useAnnouncementSocket('ch-1'), { wrapper });

      await emit(SocketEvent.ANNOUNCEMENT_CONFIRMED, CONFIRMED);

      for (const status of ['confirmed', 'pending'] as const) {
        const cached = queryClient.getQueryData<{ pages: ReceiptsPage[] }>(
          announcementKeys.receipts('m-1', status),
        );
        expect(cached?.pages[0]?.meta.confirmedCount).toBe(13);
      }
      // Gộp: chưa tải lại ngay (một đợt xác nhận dồn dập chỉ tải một lần)…
      expect(invalidate).not.toHaveBeenCalledWith({ queryKey: announcementKeys.receiptsOf('m-1') });
      await act(async () => jest.advanceTimersByTime(600));
      // …rồi đúng MỘT lần sau khoảng lặng.
      expect(invalidate).toHaveBeenCalledWith({ queryKey: announcementKeys.receiptsOf('m-1') });
    } finally {
      jest.useRealTimers();
    }
  });

  it('dồn dập 50 sự kiện → chỉ MỘT lượt tải lại danh sách xác nhận', async () => {
    jest.useFakeTimers();
    try {
      const { queryClient, wrapper } = setupSocketHook();
      const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
      await renderHook(() => useAnnouncementSocket('ch-1'), { wrapper });

      for (let count = 13; count < 63; count += 1) {
        await emit(SocketEvent.ANNOUNCEMENT_CONFIRMED, { ...CONFIRMED, confirmedCount: count });
      }
      await act(async () => jest.advanceTimersByTime(600));

      const receiptRefreshes = invalidate.mock.calls.filter(
        ([filter]) =>
          JSON.stringify(filter?.queryKey) === JSON.stringify(announcementKeys.receiptsOf('m-1')),
      );
      expect(receiptRefreshes).toHaveLength(1);
      expect(readList(queryClient)?.[0]?.confirmedCount).toBe(62);
    } finally {
      jest.useRealTimers();
    }
  });

  it('kênh khác → bỏ qua; tin chưa có trong cache → tải lại danh sách để có dòng', async () => {
    const { queryClient, wrapper } = setupSocketHook();
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
    await renderHook(() => useAnnouncementSocket('ch-1'), { wrapper });

    await emit(SocketEvent.ANNOUNCEMENT_CONFIRMED, { ...CONFIRMED, channelId: 'ch-khac' });
    expect(readList(queryClient)?.[0]?.confirmedCount).toBe(12);
    expect(invalidate).not.toHaveBeenCalled();

    await emit(SocketEvent.ANNOUNCEMENT_CONFIRMED, { ...CONFIRMED, messageId: 'tin-moi' });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: LIST_KEY });
  });
});
