import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { announcementKeys } from '../api/announcements.keys';
import { announcementsService } from '../api/announcements.service';
import type { ReceiptStatus, ReceiptsPage } from '../api/announcements.types';
import { useAnnouncementReceipts } from '../queries/receipts.queries';
import { apiError, makeReceipt, receiptsPage } from './fixtures';
import { deferred, flush } from './harness';

/**
 * Danh sách đã/chưa xác nhận (app.md p5-04 §3 "Danh sách xác nhận"), ở MỨC HOOK: phân trang cursor của BE, hai tab là hai cache riêng,
 * đổi tab không làm nhấp nháy số đếm "12/40", lỗi 403/404 hiện NGAY (không thử lại). Ca giao diện: `AnnouncementReceiptsScreen.test.tsx`.
 */
jest.mock('../api/announcements.service', () => ({
  announcementsService: { listReceipts: jest.fn() },
}));

const listReceipts = jest.mocked(announcementsService.listReceipts);

/** `QueryClient` của test đặt MẶC ĐỊNH thử lại 3 lần — hook phải tự tắt (`retry: false`), test 403 mới bắt được nếu ai bỏ dòng đó. */
function setup() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { gcTime: Infinity, retry: 3, retryDelay: 1 } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, wrapper };
}

const namesOf = (pages: ReceiptsPage[] | undefined) =>
  pages?.flatMap((page) => page.data.map((item) => item.name));

const useWithStatus = ({ status }: { status: ReceiptStatus }) =>
  useAnnouncementReceipts('m-1', status);

beforeEach(() => jest.clearAllMocks());

describe('useAnnouncementReceipts — phân trang cursor', () => {
  it('trang đầu KHÔNG có cursor; trang kế dùng đúng `nextCursor` của BE; hết trang khi `hasMore = false`', async () => {
    const { wrapper } = setup();
    listReceipts
      .mockResolvedValueOnce(receiptsPage([makeReceipt('An')], { hasMore: true, nextCursor: 'c1' }))
      .mockResolvedValueOnce(receiptsPage([makeReceipt('Bình')], { hasMore: false }));
    const { result } = await renderHook(() => useAnnouncementReceipts('m-1', 'confirmed'), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(listReceipts).toHaveBeenLastCalledWith('m-1', {
      cursor: undefined,
      status: 'confirmed',
    });
    expect(result.current.hasNextPage).toBe(true);

    await act(async () => void (await result.current.fetchNextPage()));
    await flush();

    expect(listReceipts).toHaveBeenLastCalledWith('m-1', { cursor: 'c1', status: 'confirmed' });
    expect(namesOf(result.current.data?.pages)).toEqual(['An', 'Bình']);
    expect(result.current.hasNextPage).toBe(false);
  });

  it('`hasMore = true` nhưng `nextCursor = null` → coi như hết trang (không lặp vô hạn)', async () => {
    const { wrapper } = setup();
    listReceipts.mockResolvedValue(receiptsPage([], { hasMore: true, nextCursor: null }));
    const { result } = await renderHook(() => useAnnouncementReceipts('m-1', 'pending'), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.hasNextPage).toBe(false);
  });
});

describe('useAnnouncementReceipts — hai tab', () => {
  it('mỗi tab là MỘT cache riêng, gọi đúng `status` của tab', async () => {
    const { queryClient, wrapper } = setup();
    listReceipts.mockImplementation(async (_id, { status }) =>
      receiptsPage([makeReceipt(status === 'confirmed' ? 'An' : 'Chi')]),
    );
    const { result, rerender } = await renderHook(useWithStatus, {
      initialProps: { status: 'confirmed' as ReceiptStatus },
      wrapper,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    await rerender({ status: 'pending' });
    await flush();

    const cached = (status: ReceiptStatus) =>
      queryClient.getQueryData<{ pages: ReceiptsPage[] }>(announcementKeys.receipts('m-1', status));
    expect(namesOf(cached('confirmed')?.pages)).toEqual(['An']);
    expect(namesOf(cached('pending')?.pages)).toEqual(['Chi']);
    expect(listReceipts).toHaveBeenCalledWith('m-1', { cursor: undefined, status: 'pending' });
  });

  it('đổi tab: trong lúc tab mới tải vẫn giữ `data` cũ (số đếm 12/40 không nhấp nháy) và báo `isPlaceholderData`', async () => {
    const { wrapper } = setup();
    const pending = deferred<ReceiptsPage>();
    const counts = { audienceCount: 40, confirmedCount: 12 };
    listReceipts.mockImplementation((_id, { status }) =>
      status === 'confirmed'
        ? Promise.resolve(receiptsPage([makeReceipt('An')], counts))
        : pending.promise,
    );
    const { result, rerender } = await renderHook(useWithStatus, {
      initialProps: { status: 'confirmed' as ReceiptStatus },
      wrapper,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.isPlaceholderData).toBe(false);

    await rerender({ status: 'pending' });

    expect(result.current.isPlaceholderData).toBe(true);
    expect(result.current.data?.pages[0]?.meta).toMatchObject(counts);

    await act(async () => pending.resolve(receiptsPage([makeReceipt('Chi')], counts)));
    await flush();

    expect(result.current.isPlaceholderData).toBe(false);
    expect(namesOf(result.current.data?.pages)).toEqual(['Chi']);
  });
});

describe('useAnnouncementReceipts — lỗi', () => {
  it('403 (mất quyền xem) → lỗi NGAY, đúng MỘT lượt gọi — không thử lại ba lần trước khi màn quay lại', async () => {
    const { wrapper } = setup();
    listReceipts.mockRejectedValue(apiError(403, 'AUTH_006'));
    const { result } = await renderHook(() => useAnnouncementReceipts('m-1', 'confirmed'), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(listReceipts).toHaveBeenCalledTimes(1);
  });
});
