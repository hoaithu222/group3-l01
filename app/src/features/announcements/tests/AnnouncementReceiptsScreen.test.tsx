import { act, fireEvent, screen } from '@testing-library/react-native';

import { announcementKeys } from '../api/announcements.keys';
import { AnnouncementReceiptsScreen } from '../screens/AnnouncementReceiptsScreen';
import {
  makeQueryClient,
  makeReceipt,
  makeView,
  receiptsPage,
  renderWithProviders,
} from './fixtures';
import { mockedReceipts, PENDING, serveDefaultReceipts, serveReceipts } from './receipts-harness';

/**
 * Danh sách xác nhận (app.md p5-04 §3) — phần TAB và SỐ ĐẾM: hai tab Đã xác nhận / Chưa xác nhận (cursor), "12/40 đã xác nhận"
 * lấy từ `meta` và giữ khi đổi tab, trạng thái rỗng. Lỗi/mất quyền/realtime: `AnnouncementReceiptsScreen.states.test.tsx`.
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

beforeEach(() => {
  jest.clearAllMocks();
  serveDefaultReceipts();
});

describe('AnnouncementReceiptsScreen — số đếm và tab', () => {
  it('mặc định tab "Đã xác nhận": "12/40 đã xác nhận", số đếm trên hai tab, dòng có giờ xác nhận', async () => {
    await renderWithProviders(<AnnouncementReceiptsScreen />);

    expect(await screen.findByText('12/40 đã xác nhận')).toBeOnTheScreen();
    expect(screen.getByText('An')).toBeOnTheScreen();
    expect(screen.getByText('Bình')).toBeOnTheScreen();
    expect(screen.getAllByText(/^Đã xác nhận lúc /)).toHaveLength(2);
    expect(mockedReceipts()).toHaveBeenCalledWith('m-1', {
      cursor: undefined,
      status: 'confirmed',
    });
    // Tab: "Đã xác nhận" kèm 12, "Chưa xác nhận" kèm 40 − 12 = 28.
    expect(screen.getByText('12')).toBeOnTheScreen();
    expect(screen.getByText('28')).toBeOnTheScreen();
  });

  it('đổi sang "Chưa xác nhận" → gọi status=pending, hiện người chưa xác nhận; số đếm KHÔNG nhấp nháy mất', async () => {
    await renderWithProviders(<AnnouncementReceiptsScreen />);
    await screen.findByText('An');

    await fireEvent.press(screen.getByText('Chưa xác nhận'));

    expect(await screen.findByText('Chi')).toBeOnTheScreen();
    expect(screen.getByText('Thành viên')).toBeOnTheScreen(); // `name: null` → nhãn trung tính
    expect(screen.queryByText('An')).toBeNull(); // dòng của tab cũ không lẫn sang
    expect(screen.getByText('12/40 đã xác nhận')).toBeOnTheScreen();
    expect(mockedReceipts()).toHaveBeenCalledWith('m-1', { cursor: undefined, status: 'pending' });
    // Dòng "chưa xác nhận" không có giờ xác nhận.
    expect(screen.queryByText(/^Đã xác nhận lúc /)).toBeNull();
  });

  it('đổi tab đang tải: ẩn dòng của tab cũ (khung chờ) nhưng GIỮ số đếm', async () => {
    await renderWithProviders(<AnnouncementReceiptsScreen />);
    await screen.findByText('An');
    let release!: (page: ReturnType<typeof receiptsPage>) => void;
    mockedReceipts().mockReturnValueOnce(new Promise((resolve) => (release = resolve)));

    await fireEvent.press(screen.getByText('Chưa xác nhận'));

    expect(screen.queryByText('An')).toBeNull();
    expect(screen.getByText('12/40 đã xác nhận')).toBeOnTheScreen();
    await act(async () => release(receiptsPage(PENDING)));
    expect(await screen.findByText('Chi')).toBeOnTheScreen();
  });

  it('tab "Đã xác nhận" rỗng → "Chưa ai xác nhận"; tab "Chưa xác nhận" rỗng → "Mọi người đã xác nhận"', async () => {
    serveReceipts({
      confirmed: receiptsPage([], { confirmedCount: 0 }),
      pending: receiptsPage([], { confirmedCount: 40 }),
    });
    await renderWithProviders(<AnnouncementReceiptsScreen />);

    expect(await screen.findByText('Chưa ai xác nhận')).toBeOnTheScreen();
    expect(screen.getByText('0/40 đã xác nhận')).toBeOnTheScreen();

    await fireEvent.press(screen.getByText('Chưa xác nhận'));

    expect(await screen.findByText('Mọi người đã xác nhận')).toBeOnTheScreen();
  });

  it('trang đầu rỗng nhưng `hasMore` (BE lọc người đã mất quyền) → tự tải trang sau, KHÔNG kết luận "Chưa ai xác nhận"', async () => {
    mockedReceipts()
      .mockResolvedValueOnce(receiptsPage([], { hasMore: true, nextCursor: 'c2' }))
      .mockResolvedValueOnce(
        receiptsPage([makeReceipt('An', { confirmedAt: '2026-09-25T03:30:00.000Z' })]),
      );
    await renderWithProviders(<AnnouncementReceiptsScreen />);

    expect(await screen.findByText('An')).toBeOnTheScreen();
    expect(mockedReceipts()).toHaveBeenNthCalledWith(2, 'm-1', {
      cursor: 'c2',
      status: 'confirmed',
    });
    expect(screen.queryByText('Chưa ai xác nhận')).toBeNull();
  });

  it('hiện hạn xác nhận khi danh sách của kênh đã có trong cache', async () => {
    const queryClient = makeQueryClient();
    queryClient.setQueryData(announcementKeys.channel('ch-1'), [
      makeView({ deadlineAt: '2026-10-01T09:00:00.000Z' }),
    ]);
    await renderWithProviders(<AnnouncementReceiptsScreen />, queryClient);

    expect(await screen.findByText(/^Hạn /)).toBeOnTheScreen();
  });
});
