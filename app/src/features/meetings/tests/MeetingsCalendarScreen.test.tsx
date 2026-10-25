import dayjs from 'dayjs';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import { useBreakpoint } from '@/shared/theme';

import { meetingsService } from '../api/meetings.service';
import { meetingsLookupService } from '../api/meetings-lookup.service';
import { MeetingsCalendarScreen } from '../screens/MeetingsCalendarScreen';
import { monthTitle } from '../utils/meeting-month.utils';
import { makeListItem } from './fixtures';
import { renderWithProviders } from './render-helpers';

/** Màn Lịch (app.md p2-04 §8): nhóm theo ngày + rỗng + lỗi (điện thoại); lưới tháng + agenda ngày chọn (máy tính bảng). */
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), canGoBack: jest.fn(() => false), push: jest.fn(), replace: jest.fn() },
}));
jest.mock('@/core/socket', () => ({ useConnectionState: jest.fn(() => 'connected') }));
jest.mock('@/shared/theme', () => ({
  ...jest.requireActual('@/shared/theme'),
  useBreakpoint: jest.fn(),
}));
jest.mock('../api/meetings.service', () => ({ meetingsService: { listMine: jest.fn() } }));
jest.mock('../api/meetings-lookup.service', () => ({
  meetingsLookupService: { listMyWorkspaces: jest.fn(), searchWorkspaceMembers: jest.fn() },
}));

const mockedList = jest.mocked(meetingsService.listMine);
const mockedBreakpoint = jest.mocked(useBreakpoint);

function setBreakpoint(isTablet: boolean) {
  mockedBreakpoint.mockReturnValue({
    height: 800,
    isLandscape: false,
    isTablet,
    tier: isTablet ? 'tablet' : 'phone',
    width: isTablet ? 800 : 390,
  });
}

/** Cuộc họp hôm nay 09:00 và ngày mai 10:00 (giờ máy). */
function twoDays() {
  const today = dayjs().hour(9).minute(0).second(0).millisecond(0);
  const tomorrow = today.add(1, 'day').hour(10);
  return [
    makeListItem({
      endAt: today.add(1, 'hour').toISOString(),
      id: 'a',
      startAt: today.toISOString(),
      title: 'Họp sáng nay',
    }),
    makeListItem({
      endAt: tomorrow.add(1, 'hour').toISOString(),
      id: 'b',
      startAt: tomorrow.toISOString(),
      title: 'Họp ngày mai',
    }),
  ];
}

beforeEach(() => {
  jest.clearAllMocks();
  setBreakpoint(false);
  jest.mocked(meetingsLookupService.listMyWorkspaces).mockResolvedValue([]);
});

describe('MeetingsCalendarScreen — điện thoại', () => {
  it('nhóm cuộc họp theo ngày: tiêu đề ngày (Hôm nay/Ngày mai), thẻ có giờ và trạng thái bằng chữ', async () => {
    mockedList.mockResolvedValue(twoDays());
    await renderWithProviders(<MeetingsCalendarScreen />);

    expect(await screen.findByText('Họp sáng nay')).toBeOnTheScreen();
    expect(screen.getByText('Họp ngày mai')).toBeOnTheScreen();
    expect(screen.getByText(/^Hôm nay · /)).toBeOnTheScreen();
    expect(screen.getByText(/^Ngày mai · /)).toBeOnTheScreen();
    expect(screen.getAllByText('Sắp tới').length).toBeGreaterThanOrEqual(2);
    // Điện thoại: dải tuần, KHÔNG có lưới tháng.
    expect(screen.getByLabelText('Tuần trước')).toBeOnTheScreen();
    expect(screen.queryByLabelText('Tháng trước')).toBeNull();
  });

  it('bấm thẻ mở chi tiết đúng cuộc họp', async () => {
    mockedList.mockResolvedValue(twoDays());
    await renderWithProviders(<MeetingsCalendarScreen />);

    await fireEvent.press(await screen.findByText('Họp sáng nay'));
    expect(router.push).toHaveBeenCalledWith({
      params: { meetingId: 'a' },
      pathname: '/meetings/[meetingId]',
    });
  });

  it('rỗng: "Lịch trống" + nút "Tạo cuộc họp" mở form tạo', async () => {
    mockedList.mockResolvedValue([]);
    await renderWithProviders(<MeetingsCalendarScreen />);

    expect(await screen.findByText('Lịch trống')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Tạo cuộc họp'));
    expect(router.push).toHaveBeenCalledWith('/meetings/new');
  });

  it('lỗi tải (chưa có dữ liệu): thông báo tại chỗ + "Thử lại" gọi lại API', async () => {
    mockedList.mockRejectedValue(new Error('mạng'));
    await renderWithProviders(<MeetingsCalendarScreen />);

    expect(await screen.findByText('Không tải được lịch')).toBeOnTheScreen();
    mockedList.mockResolvedValue(twoDays());
    await fireEvent.press(screen.getByText('Thử lại'));
    expect(await screen.findByText('Họp sáng nay')).toBeOnTheScreen();
  });
});

describe('MeetingsCalendarScreen — máy tính bảng', () => {
  it('hai cột: lưới tháng + agenda của NGÀY CHỌN; chọn ngày khác đổi agenda', async () => {
    setBreakpoint(true);
    mockedList.mockResolvedValue(twoDays());
    await renderWithProviders(<MeetingsCalendarScreen />);

    expect(await screen.findByText(monthTitle(new Date()))).toBeOnTheScreen();
    expect(await screen.findByText('Họp sáng nay')).toBeOnTheScreen();
    expect(screen.queryByText('Họp ngày mai')).toBeNull();

    const tomorrow = dayjs().add(1, 'day');
    const cell = screen.getByLabelText(
      new RegExp(`ngày ${String(tomorrow.date())} tháng ${String(tomorrow.month() + 1)}, `),
    );
    await fireEvent.press(cell);
    expect(await screen.findByText('Họp ngày mai')).toBeOnTheScreen();
    expect(screen.queryByText('Họp sáng nay')).toBeNull();
  });

  it('ô ngày có họp báo "N cuộc họp" trong nhãn trợ năng (không chỉ chấm màu)', async () => {
    setBreakpoint(true);
    mockedList.mockResolvedValue(twoDays());
    await renderWithProviders(<MeetingsCalendarScreen />);

    await screen.findByText('Họp sáng nay');
    const today = dayjs();
    expect(
      screen.getByLabelText(
        new RegExp(
          `ngày ${String(today.date())} tháng ${String(today.month() + 1)}, hôm nay, 1 cuộc họp`,
        ),
      ),
    ).toBeOnTheScreen();
  });

  it('chuyển tháng tải LẠI đúng cửa sổ của tháng mới (không dùng cửa sổ tuần)', async () => {
    setBreakpoint(true);
    mockedList.mockResolvedValue([]);
    await renderWithProviders(<MeetingsCalendarScreen />);
    await screen.findByText('Lịch trống');

    await fireEvent.press(screen.getByLabelText('Tháng sau'));
    await waitFor(() => expect(mockedList).toHaveBeenCalledTimes(2));
    // Cho lượt tải nền của tháng mới về hẳn TRONG act (nếu không, cập nhật state của React Query rơi ra ngoài act).
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByText(monthTitle(dayjs().add(1, 'month').toDate()))).toBeOnTheScreen();
    const first = mockedList.mock.calls[0]?.[0];
    const second = mockedList.mock.calls[1]?.[0];
    expect(second?.from).not.toBe(first?.from);
    // Cửa sổ tháng ≤ 42 ngày (≤ rangeMaxDays 62 của BE).
    const days = (Date.parse(second?.to ?? '') - Date.parse(second?.from ?? '')) / 86_400_000;
    expect(days).toBeLessThanOrEqual(42);
  });

  it('ngày ĐÃ QUA trống: không mời "Tạo cuộc họp" (form không cho đặt lịch quá khứ)', async () => {
    setBreakpoint(true);
    mockedList.mockResolvedValue([]);
    await renderWithProviders(<MeetingsCalendarScreen />);
    await screen.findByText('Lịch trống');

    const yesterday = dayjs().subtract(1, 'day');
    const cell = screen.getByLabelText(
      new RegExp(`ngày ${String(yesterday.date())} tháng ${String(yesterday.month() + 1)}, `),
    );
    await fireEvent.press(cell);
    expect(await screen.findByText('Ngày này chưa có cuộc họp nào.')).toBeOnTheScreen();
    expect(screen.queryByText('Tạo cuộc họp')).toBeNull();
  });

  it('"Tạo cuộc họp" trong ngày trống gắn sẵn NGÀY đang chọn', async () => {
    setBreakpoint(true);
    mockedList.mockResolvedValue([]);
    await renderWithProviders(<MeetingsCalendarScreen />);

    await fireEvent.press(await screen.findByText('Tạo cuộc họp'));
    expect(router.push).toHaveBeenCalledWith({
      params: { date: dayjs().format('YYYY-MM-DD') },
      pathname: '/meetings/new',
    });
  });
});
