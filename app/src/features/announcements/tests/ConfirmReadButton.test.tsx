import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';

import { useConnectionState } from '@/core/socket';
import { showToast } from '@/shared/utils/toast.utils';
import { useFeature } from '@/shell/capabilities';
import { useAuthStore } from '@/shell/store/slices/auth';

import { announcementKeys } from '../api/announcements.keys';
import { announcementsService } from '../api/announcements.service';
import type { AnnouncementView } from '../api/announcements.types';
import { AnnouncementFooter } from '../components/AnnouncementFooter';
import {
  apiError,
  makeMessage,
  makeQueryClient,
  makeScope,
  makeView,
  renderWithProviders,
} from './fixtures';

/**
 * `ConfirmReadButton` (app.md p5-04 §4, §8): "Tôi đã đọc" LẠC QUAN (`confirmedByMe = true` ngay), lỗi → hoàn lại đúng dòng
 * đó; `ANN_003` đóng vòng (đặt "Đã hết hạn" + toast, KHÔNG cho bấm lại); mất mạng → nút khoá "Kết nối lại để xác nhận".
 * Dựng qua `AnnouncementFooter` vì nút là một phần của hàng phụ dưới bong bóng — xem đúng thứ người dùng thấy.
 */
jest.mock('@/shared/utils/toast.utils', () => ({ showToast: jest.fn() }));
jest.mock('@/shell/capabilities', () => ({ useFeature: jest.fn() }));
jest.mock('@/core/socket', () => ({
  ...jest.requireActual('@/core/socket'),
  useConnectionState: jest.fn(),
}));
jest.mock('../api/announcements.service', () => ({
  announcementsService: { confirm: jest.fn(), listByChannel: jest.fn() },
}));

const mockedConfirm = jest.mocked(announcementsService.confirm);
const mockedConnection = jest.mocked(useConnectionState);
const mockedFeature = jest.mocked(useFeature);
const mockedToast = jest.mocked(showToast);

const KEY = announcementKeys.channel('ch-1');
const readList = (client: ReturnType<typeof makeQueryClient>) =>
  client.getQueryData<AnnouncementView[]>(KEY);

function footer() {
  return <AnnouncementFooter isOwn={false} message={makeMessage()} scope={makeScope()} />;
}

async function setup(view: AnnouncementView = makeView()) {
  const queryClient = makeQueryClient();
  queryClient.setQueryData(KEY, [view]);
  await renderWithProviders(footer(), queryClient);
  return queryClient;
}

/** Yêu cầu HTTP treo lơ lửng — để kiểm trạng thái LẠC QUAN trước khi server trả lời. */
function deferredConfirm() {
  let resolve!: (value: { confirmedAt: string }) => void;
  let reject!: (error: unknown) => void;
  mockedConfirm.mockReturnValue(
    new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    }),
  );
  return { reject, resolve };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedConnection.mockReturnValue('connected');
  mockedFeature.mockReturnValue(true);
  useAuthStore.setState({ user: { id: 'u-me', name: 'Tôi' } as never });
});

describe('ConfirmReadButton — lạc quan', () => {
  it('bấm "Tôi đã đọc" → huy hiệu thành "Đã xác nhận" và nút biến mất NGAY, trước khi server trả lời', async () => {
    const request = deferredConfirm();
    const queryClient = await setup();
    expect(screen.getByText('Cần xác nhận')).toBeOnTheScreen();

    await fireEvent.press(screen.getByText('Tôi đã đọc'));

    await waitFor(() => expect(screen.getByText('Đã xác nhận')).toBeOnTheScreen());
    expect(screen.queryByText('Tôi đã đọc')).toBeNull();
    expect(readList(queryClient)?.[0]?.confirmedByMe).toBe(true);
    expect(mockedConfirm).toHaveBeenCalledWith('m-1');

    await act(async () => request.resolve({ confirmedAt: '2026-09-25T01:00:00.000Z' }));
    expect(screen.getByText('Đã xác nhận')).toBeOnTheScreen();
    expect(mockedToast).not.toHaveBeenCalled();
  });

  it('lỗi mạng → HOÀN LẠI: huy hiệu về "Cần xác nhận", nút quay lại, có toast lý do', async () => {
    const request = deferredConfirm();
    const queryClient = await setup();

    await fireEvent.press(screen.getByText('Tôi đã đọc'));
    await waitFor(() => expect(screen.getByText('Đã xác nhận')).toBeOnTheScreen());

    await act(async () =>
      request.reject(Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK' })),
    );

    await waitFor(() => expect(screen.getByText('Cần xác nhận')).toBeOnTheScreen());
    expect(screen.getByText('Tôi đã đọc')).toBeOnTheScreen();
    expect(readList(queryClient)?.[0]?.confirmedByMe).toBe(false);
    expect(mockedToast).toHaveBeenCalledWith('error', expect.any(String));
  });

  it('hoàn lại TỪNG DÒNG: dòng khác đổi trong lúc chờ (socket) không bị khôi phục nhầm', async () => {
    const request = deferredConfirm();
    const queryClient = makeQueryClient();
    queryClient.setQueryData(KEY, [makeView(), makeView({ messageId: 'm-2' })]);
    await renderWithProviders(footer(), queryClient);

    await fireEvent.press(screen.getByText('Tôi đã đọc'));
    await waitFor(() => expect(screen.getByText('Đã xác nhận')).toBeOnTheScreen());
    // Socket huỷ yêu cầu của tin khác giữa chừng.
    await act(async () =>
      queryClient.setQueryData(KEY, (list: AnnouncementView[]) =>
        list.filter((v) => v.messageId !== 'm-2'),
      ),
    );

    await act(async () => request.reject(new Error('boom')));

    await waitFor(() =>
      expect(readList(queryClient)?.map((v) => [v.messageId, v.confirmedByMe])).toEqual([
        ['m-1', false],
      ]),
    );
  });
});

describe('ConfirmReadButton — ANN_003 (đã huỷ/hết hạn)', () => {
  it('server 410 ANN_003 → "Đã hết hạn" + toast nhãn riêng, KHÔNG quay về "Cần xác nhận"', async () => {
    const request = deferredConfirm();
    const queryClient = await setup();

    await fireEvent.press(screen.getByText('Tôi đã đọc'));
    await act(async () => request.reject(apiError(410, 'ANN_003')));

    await waitFor(() => expect(screen.getByText('Đã hết hạn')).toBeOnTheScreen());
    expect(screen.queryByText('Tôi đã đọc')).toBeNull();
    expect(readList(queryClient)?.[0]).toMatchObject({ confirmedByMe: false, expired: true });
    expect(mockedToast).toHaveBeenCalledWith('error', 'Yêu cầu xác nhận đã bị huỷ hoặc hết hạn');
  });
});

describe('ConfirmReadButton — offline & phân quyền', () => {
  it('mất mạng → nút KHOÁ và đổi nhãn "Kết nối lại để xác nhận"; bấm không gọi API', async () => {
    mockedConnection.mockReturnValue('offline');
    await setup();

    await fireEvent.press(screen.getByText('Kết nối lại để xác nhận'));

    expect(screen.queryByText('Tôi đã đọc')).toBeNull();
    expect(mockedConfirm).not.toHaveBeenCalled();
  });

  it('người yêu cầu KHÔNG có nút "Tôi đã đọc" (không nằm trong tập cần xác nhận), chỉ thấy tiến độ', async () => {
    useAuthStore.setState({ user: { id: 'u-admin', name: 'Admin' } as never });
    await setup(makeView({ canViewReceipts: true, confirmedCount: 3 }));

    expect(screen.getByText('Cần xác nhận')).toBeOnTheScreen();
    expect(screen.queryByText('Tôi đã đọc')).toBeNull();
    expect(screen.getByText('3 đã xác nhận')).toBeOnTheScreen();
  });

  it('đã xác nhận / đã hết hạn → không có nút', async () => {
    await setup(makeView({ confirmedByMe: true }));
    expect(screen.getByText('Đã xác nhận')).toBeOnTheScreen();
    expect(screen.queryByText('Tôi đã đọc')).toBeNull();
  });

  it.each([[false], [undefined]])(
    'cờ `readConfirm` = %s (tắt giữa chừng) → ẩn cả huy hiệu lẫn nút dù cache còn dữ liệu cũ',
    async (flag) => {
      mockedFeature.mockReturnValue(flag);
      await setup();

      expect(screen.queryByText('Cần xác nhận')).toBeNull();
      expect(screen.queryByText('Tôi đã đọc')).toBeNull();
    },
  );
});
