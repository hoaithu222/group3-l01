import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { io } from 'socket.io-client';

import { SocketEvent } from '@/core/socket';
import { showToast } from '@/shared/utils/toast.utils';

import { AnnouncementReceiptsScreen } from '../screens/AnnouncementReceiptsScreen';
import { apiError, renderWithProviders } from './fixtures';
import { mockedReceipts, serveDefaultReceipts } from './receipts-harness';

/**
 * Danh sách xác nhận (app.md p5-04 §3) — phần LỖI/MẤT QUYỀN và REALTIME: 403 → toast trung tính + quay lại, lỗi khác → "Thử
 * lại", `announcement:confirmed` vá số đếm ngay. Tab/số đếm/rỗng: `AnnouncementReceiptsScreen.test.tsx`.
 */
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn() },
  useLocalSearchParams: () => ({ chId: 'ch-1', messageId: 'm-1', wsId: 'ws-1' }),
}));
jest.mock('@shopify/flash-list', () => ({
  FlashList: jest.requireActual('react-native').FlatList,
}));
jest.mock('@/shared/utils/toast.utils', () => ({ showToast: jest.fn() }));
jest.mock('../api/announcements.service', () => ({
  announcementsService: { listReceipts: jest.fn() },
}));

interface MockSocket {
  __emitServer: (event: string, payload?: unknown) => void;
}
const mockSocket = (io as jest.MockedFunction<typeof io>).mock.results[0]?.value as MockSocket;
const emitConfirmed = (payload: { channelId: string; confirmedCount: number; messageId: string }) =>
  act(async () => mockSocket.__emitServer(SocketEvent.ANNOUNCEMENT_CONFIRMED, payload));

beforeEach(() => {
  jest.clearAllMocks();
  serveDefaultReceipts();
});

describe('AnnouncementReceiptsScreen — lỗi và mất quyền', () => {
  it('403 (không còn là người yêu cầu/quản trị) → toast trung tính + quay lại', async () => {
    mockedReceipts().mockRejectedValue(apiError(403, 'PERM_403'));
    await renderWithProviders(<AnnouncementReceiptsScreen />);

    await waitFor(() => expect(router.back).toHaveBeenCalledTimes(1));
    expect(jest.mocked(showToast)).toHaveBeenCalledWith(
      'info',
      'Bạn không còn quyền xem danh sách này.',
    );
  });

  it('lỗi khác (500) → thông báo + "Thử lại" tải lại; KHÔNG rời màn', async () => {
    mockedReceipts().mockRejectedValueOnce(apiError(500, 'SYS_500'));
    await renderWithProviders(<AnnouncementReceiptsScreen />);

    expect(await screen.findByText('Không tải được danh sách')).toBeOnTheScreen();
    expect(router.back).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByText('Thử lại'));

    expect(await screen.findByText('An')).toBeOnTheScreen();
  });
});

describe('AnnouncementReceiptsScreen — realtime', () => {
  it('`announcement:confirmed` của ĐÚNG tin → vá "12/40" thành "13/40" ngay, không đợi tải lại', async () => {
    await renderWithProviders(<AnnouncementReceiptsScreen />);
    expect(await screen.findByText('12/40 đã xác nhận')).toBeOnTheScreen();

    await emitConfirmed({ channelId: 'ch-1', confirmedCount: 13, messageId: 'm-1' });

    // React Query báo observer bằng `setTimeout(0)` ⇒ đợi vẽ lại chứ không đọc ngay sau `act`.
    expect(await screen.findByText('13/40 đã xác nhận')).toBeOnTheScreen();
    // Tab "Chưa xác nhận" cũng đổi theo: 40 − 13 = 27.
    expect(screen.getByText('27')).toBeOnTheScreen();
  });

  it('sự kiện của kênh/tin khác → bỏ qua', async () => {
    await renderWithProviders(<AnnouncementReceiptsScreen />);
    await screen.findByText('12/40 đã xác nhận');

    await emitConfirmed({ channelId: 'ch-khac', confirmedCount: 99, messageId: 'm-1' });
    await emitConfirmed({ channelId: 'ch-1', confirmedCount: 99, messageId: 'tin-khac' });
    // Chờ hết lượt `setTimeout(0)` báo observer của React Query — không thì "không đổi" đúng cả khi handler vá nhầm.
    await act(async () => new Promise((resolve) => setTimeout(resolve, 20)));

    expect(screen.getByText('12/40 đã xác nhận')).toBeOnTheScreen();
    expect(screen.queryByText('99/40 đã xác nhận')).toBeNull();
  });
});
