import { act, renderHook, waitFor } from '@testing-library/react-native';

import { showToast } from '@/shared/utils/toast.utils';

import { announcementsService } from '../api/announcements.service';
import type { AnnouncementView } from '../api/announcements.types';
import { useConfirmRead } from '../queries/announcement-actions.queries';
import { useChannelAnnouncements } from '../queries/announcements.queries';
import { apiError, makeView } from './fixtures';
import { deferred, flush, LIST_KEY, readList, rowsOf, run, setupHookClient } from './harness';

/**
 * `useConfirmRead` ("Tôi đã đọc"), ở MỨC HOOK — ca giao diện (nút, huy hiệu, offline) nằm ở `ConfirmReadButton.test.tsx`. Cache danh sách theo
 * kênh là nguồn duy nhất của huy hiệu, nên các khẳng định đọc thẳng `getQueryData`. `listByChannel` ĐƯỢC MOUNT cùng (một observer đang bật)
 * ở những ca cần kiểm "tải lại khi xong"; không phụ thuộc `staleTime` của hook tải (ca đó tự đo số lượt gọi trước/sau).
 */
jest.mock('@/shared/utils/toast.utils', () => ({ showToast: jest.fn() }));
jest.mock('../api/announcements.service', () => ({
  announcementsService: { confirm: jest.fn(), listByChannel: jest.fn() },
}));

const service = jest.mocked(announcementsService);
const toast = jest.mocked(showToast);

/** Danh sách mà "server" trả khi tải lại kênh. */
let serverList: AnnouncementView[];

beforeEach(() => {
  jest.clearAllMocks();
  serverList = [makeView()];
  service.listByChannel.mockImplementation(async () => serverList);
});

const useWithObserver = () => ({
  list: useChannelAnnouncements('ch-1'),
  mutation: useConfirmRead('ch-1'),
});

describe('useConfirmRead', () => {
  it('ghi lạc quan `confirmedByMe`; chưa xong thì chưa tải lại, xong (onSettled) thì tải lại danh sách kênh', async () => {
    const { queryClient, wrapper } = setupHookClient([makeView()]);
    const confirm = deferred<{ confirmedAt: string }>();
    service.confirm.mockReturnValue(confirm.promise);
    const { result } = await renderHook(useWithObserver, { wrapper });
    await flush(); // lượt tải lúc mount (nếu có) xong hẳn trước khi đo
    const loadsBefore = service.listByChannel.mock.calls.length;

    await act(async () => result.current.mutation.mutate('m-1'));

    await waitFor(() => expect(rowsOf(queryClient)).toEqual([['m-1', true]]));
    expect(service.confirm).toHaveBeenCalledWith('m-1');
    expect(service.listByChannel).toHaveBeenCalledTimes(loadsBefore);

    serverList = [makeView({ confirmedByMe: true })];
    await act(async () => confirm.resolve({ confirmedAt: '2026-09-25T01:00:00.000Z' }));

    await waitFor(() => expect(service.listByChannel).toHaveBeenCalledTimes(loadsBefore + 1));
    expect(rowsOf(queryClient)).toEqual([['m-1', true]]);
    await flush();
  });

  it('huỷ lượt tải đang bay: bản danh sách CŨ trả về muộn không đè lên bản lạc quan', async () => {
    const { queryClient, wrapper } = setupHookClient([makeView()]);
    const staleFetch = deferred<AnnouncementView[]>();
    const confirm = deferred<{ confirmedAt: string }>();
    service.listByChannel.mockReturnValue(staleFetch.promise); // mọi lượt tải treo tới khi ta cho về
    service.confirm.mockReturnValue(confirm.promise);
    const { result } = await renderHook(useWithObserver, { wrapper });
    // Bảo đảm CÓ một lượt tải đang bay (danh sách CHƯA có xác nhận) khi người dùng bấm, bất kể `staleTime`.
    await act(async () => void queryClient.refetchQueries({ queryKey: LIST_KEY }));
    await waitFor(() => expect(service.listByChannel).toHaveBeenCalled());

    await act(async () => result.current.mutation.mutate('m-1'));
    await waitFor(() => expect(rowsOf(queryClient)).toEqual([['m-1', true]]));
    await act(async () => staleFetch.resolve([makeView({ confirmedByMe: false })]));

    expect(rowsOf(queryClient)).toEqual([['m-1', true]]);
    await act(async () => confirm.resolve({ confirmedAt: '2026-09-25T01:00:00.000Z' }));
    await flush();
  });

  it('đã xác nhận từ trước mà lần gọi lỗi → giữ NGUYÊN `confirmedByMe = true`, không lật về false', async () => {
    const { queryClient, wrapper } = setupHookClient([makeView({ confirmedByMe: true })]);
    service.confirm.mockRejectedValue(new Error('boom'));
    const { result } = await renderHook(() => useConfirmRead('ch-1'), { wrapper });

    await run(() => result.current.mutateAsync('m-1'));

    expect(rowsOf(queryClient)).toEqual([['m-1', true]]);
    expect(toast).toHaveBeenCalledWith('error', expect.any(String));
  });

  it('danh sách của kênh chưa có trong cache → không ném, không tự tạo dòng, không toast', async () => {
    const { queryClient, wrapper } = setupHookClient();
    service.confirm.mockResolvedValue({ confirmedAt: '2026-09-25T01:00:00.000Z' });
    const { result } = await renderHook(() => useConfirmRead('ch-1'), { wrapper });

    await run(() => result.current.mutateAsync('m-1'));

    expect(readList(queryClient)).toBeUndefined();
    expect(toast).not.toHaveBeenCalled();
  });

  it('ANN_003 (410) → đặt `expired: true` (không hoàn về "cần xác nhận") và toast nhãn riêng', async () => {
    const { queryClient, wrapper } = setupHookClient([makeView()]);
    service.confirm.mockRejectedValue(apiError(410, 'ANN_003'));
    const { result } = await renderHook(() => useConfirmRead('ch-1'), { wrapper });

    await run(() => result.current.mutateAsync('m-1'));

    expect(readList(queryClient)?.[0]).toMatchObject({ confirmedByMe: false, expired: true });
    expect(toast).toHaveBeenCalledWith('error', 'Yêu cầu xác nhận đã bị huỷ hoặc hết hạn');
  });
});
