import { act, renderHook, waitFor } from '@testing-library/react-native';

import { showToast } from '@/shared/utils/toast.utils';

import { announcementsService } from '../api/announcements.service';
import { useCancelRequest, useRequestConfirm } from '../queries/announcement-actions.queries';
import { apiError, makeView } from './fixtures';
import { deferred, flush, LIST_KEY, readList, run, setupHookClient } from './harness';

/**
 * `useRequestConfirm` (người quản lý gửi/gửi lại yêu cầu) và `useCancelRequest` (huỷ), ở MỨC HOOK — tấm "Yêu cầu" và hộp thoại "Huỷ" có test
 * component riêng. Không mount observer của danh sách: `invalidateQueries` khi đó chỉ đánh dấu cũ (không tải), nên cache đọc được là thứ
 * `onSuccess` vừa ghi; "có yêu cầu tải lại khi xong" kiểm bằng spy `invalidateQueries`.
 */
jest.mock('@/shared/utils/toast.utils', () => ({ showToast: jest.fn() }));
jest.mock('../api/announcements.service', () => ({
  announcementsService: { cancel: jest.fn(), create: jest.fn() },
}));

const service = jest.mocked(announcementsService);
const toast = jest.mocked(showToast);
const idsOf = (list: ReturnType<typeof readList>) => list?.map((view) => view.messageId);

beforeEach(() => jest.clearAllMocks());

describe('useRequestConfirm', () => {
  it('thành công: chèn view trả về vào danh sách, gửi đúng hạn tới service, toast, rồi tải lại (onSettled)', async () => {
    const { queryClient, wrapper } = setupHookClient([makeView({ messageId: 'm-0' })]);
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
    service.create.mockResolvedValue(
      makeView({ canViewReceipts: true, confirmedCount: 0, messageId: 'm-1' }),
    );
    const { result } = await renderHook(() => useRequestConfirm('ch-1'), { wrapper });
    const input = { deadlineAt: '2026-09-26T00:00:00.000Z', messageId: 'm-1' };

    await run(() => result.current.mutateAsync(input));

    expect(service.create).toHaveBeenCalledWith(input);
    expect(idsOf(readList(queryClient))).toEqual(['m-0', 'm-1']);
    expect(toast).toHaveBeenCalledWith('success', 'Đã gửi yêu cầu xác nhận');
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: LIST_KEY }));
  });

  it('yêu cầu lại tin đã có dòng (hết hạn/đã huỷ → BE khôi phục) → THAY dòng, không nhân đôi', async () => {
    const { queryClient, wrapper } = setupHookClient([
      makeView({ confirmedByMe: true, expired: true }),
    ]);
    service.create.mockResolvedValue(
      makeView({ deadlineAt: '2026-10-01T00:00:00.000Z', expired: false }),
    );
    const { result } = await renderHook(() => useRequestConfirm('ch-1'), { wrapper });

    await run(() => result.current.mutateAsync({ messageId: 'm-1' }));

    expect(readList(queryClient)).toEqual([
      expect.objectContaining({
        confirmedByMe: false,
        deadlineAt: '2026-10-01T00:00:00.000Z',
        expired: false,
      }),
    ]);
  });

  it('danh sách của kênh chưa tải → tạo danh sách mới chỉ với view vừa tạo', async () => {
    const { queryClient, wrapper } = setupHookClient();
    service.create.mockResolvedValue(makeView());
    const { result } = await renderHook(() => useRequestConfirm('ch-1'), { wrapper });

    await run(() => result.current.mutateAsync({ messageId: 'm-1' }));

    expect(idsOf(readList(queryClient))).toEqual(['m-1']);
  });

  it.each([
    [400, 'ANN_001', 'Chỉ kênh thông báo mới yêu cầu xác nhận đã đọc'],
    [409, 'ANN_002', 'Kênh đang có quá nhiều thông báo cần xác nhận'],
    [409, 'CH_004', 'Kênh đã được lưu trữ, không thể thay đổi'],
  ])(
    'lỗi %i %s → toast nhãn riêng của feature, danh sách giữ nguyên',
    async (status, code, label) => {
      const { queryClient, wrapper } = setupHookClient([makeView({ messageId: 'm-0' })]);
      service.create.mockRejectedValue(apiError(status, code));
      const { result } = await renderHook(() => useRequestConfirm('ch-1'), { wrapper });

      await run(() => result.current.mutateAsync({ messageId: 'm-1' }));

      expect(toast).toHaveBeenCalledWith('error', label);
      expect(toast).not.toHaveBeenCalledWith('success', expect.anything());
      expect(idsOf(readList(queryClient))).toEqual(['m-0']);
    },
  );
});

describe('useCancelRequest', () => {
  it('KHÔNG lạc quan: dòng còn nguyên trong lúc chờ; xong thì gỡ đúng dòng + toast', async () => {
    const { queryClient, wrapper } = setupHookClient([makeView(), makeView({ messageId: 'm-2' })]);
    const cancel = deferred<void>();
    service.cancel.mockReturnValue(cancel.promise);
    const { result } = await renderHook(() => useCancelRequest('ch-1'), { wrapper });

    await act(async () => result.current.mutate('m-1'));

    expect(service.cancel).toHaveBeenCalledWith('m-1');
    expect(idsOf(readList(queryClient))).toEqual(['m-1', 'm-2']);
    expect(toast).not.toHaveBeenCalled();

    await act(async () => cancel.resolve());
    await flush();

    await waitFor(() => expect(idsOf(readList(queryClient))).toEqual(['m-2']));
    expect(toast).toHaveBeenCalledWith('success', 'Đã huỷ yêu cầu xác nhận');
  });

  it('lỗi → dòng còn nguyên + toast lỗi', async () => {
    const { queryClient, wrapper } = setupHookClient([makeView()]);
    service.cancel.mockRejectedValue(apiError(403, 'AUTH_006'));
    const { result } = await renderHook(() => useCancelRequest('ch-1'), { wrapper });

    await run(() => result.current.mutateAsync('m-1'));

    expect(idsOf(readList(queryClient))).toEqual(['m-1']);
    expect(toast).toHaveBeenCalledWith('error', expect.any(String));
    expect(toast).not.toHaveBeenCalledWith('success', expect.anything());
  });

  it('tải lại danh sách khi xong dù thành công hay lỗi (onSettled)', async () => {
    const { queryClient, wrapper } = setupHookClient([makeView()]);
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
    service.cancel.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(undefined);
    const { result } = await renderHook(() => useCancelRequest('ch-1'), { wrapper });

    await run(() => result.current.mutateAsync('m-1'));
    await run(() => result.current.mutateAsync('m-1'));

    expect(invalidate).toHaveBeenCalledTimes(2);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: LIST_KEY });
  });
});
