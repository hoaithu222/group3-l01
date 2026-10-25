import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import { HomeWidgetsSlot } from '@/shared/home-widgets';
import { useFeature } from '@/shell/capabilities';

import { srService } from '../api/sr.service';
import type { SrSummary } from '../api/sr.types';
import { HomeSrTodayWidget } from '../components/home/HomeSrTodayWidget';
// Tác dụng phụ: đăng ký widget vào khe (giống `app/(app)/_layout.tsx`) — ca cuối kiểm khe vẽ đúng.
import '../register-home-widgets';
import { renderWithProviders } from './render-helpers';

/**
 * Widget "Ôn tập hôm nay" ở Trang chủ (H2): "N thẻ cần ôn" + "Ôn ngay", hoặc "Đã hoàn thành hôm nay". Dùng lại `GET /sr/summary`
 * và `srDueCount` của `SrDueWidget` — số khớp tab Hoạt động. Ẩn khi cờ `study` tắt (không gọi API), khi lỗi, và khi người dùng
 * chưa từng ôn mà hôm nay cũng không có thẻ nào.
 */
// `AnimatedNumber` (số thẻ đếm lên) đổi state theo khung hình — ngoài `act` của test; bật "Giảm chuyển động" để số hiện NGAY.
jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  ...jest.requireActual('react-native-reanimated'),
  useReducedMotion: () => true,
}));
jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  useIsFocused: jest.fn(() => true),
}));
jest.mock('@/shell/capabilities', () => ({ useFeature: jest.fn(() => true) }));
jest.mock('../api/sr.service', () => ({
  ...jest.requireActual('../api/sr.service'),
  srService: { summary: jest.fn() },
}));

const api = jest.mocked(srService);
const flag = jest.mocked(useFeature);

const summary = (overrides: Partial<SrSummary> = {}): SrSummary => ({
  dueNext7Days: [],
  dueToday: 5,
  newToday: 7,
  reviewStreakDays: 0,
  reviewedToday: 0,
  serverNow: '2026-09-26T02:00:00.000Z',
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
  flag.mockReturnValue(true);
  api.summary.mockResolvedValue(summary());
});

describe('HomeSrTodayWidget', () => {
  it('đến hạn 5 + thẻ mới 7 ⇒ "12 thẻ cần ôn" kèm chi tiết; "Ôn ngay" mở /study/sr (mọi bộ)', async () => {
    await renderWithProviders(<HomeSrTodayWidget />);

    expect(await screen.findByText('12 thẻ cần ôn')).toBeOnTheScreen();
    expect(screen.getByText('Ôn tập hôm nay')).toBeOnTheScreen();
    expect(screen.getByText('5 đến hạn · 7 thẻ mới')).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Ôn ngay' }));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/study/sr' });
  });

  it('không có thẻ mới ⇒ chi tiết chỉ nói số đến hạn (không hiện "0 thẻ mới")', async () => {
    api.summary.mockResolvedValue(summary({ dueToday: 3, newToday: 0 }));
    await renderWithProviders(<HomeSrTodayWidget />);

    expect(await screen.findByText('3 thẻ cần ôn')).toBeOnTheScreen();
    expect(screen.getByText('3 đến hạn')).toBeOnTheScreen();
  });

  it('hết thẻ mà hôm nay đã ôn ⇒ "Đã hoàn thành hôm nay", không có nút "Ôn ngay"', async () => {
    api.summary.mockResolvedValue(
      summary({ dueToday: 0, newToday: 0, reviewStreakDays: 3, reviewedToday: 12 }),
    );
    await renderWithProviders(<HomeSrTodayWidget />);

    expect(await screen.findByText('Đã hoàn thành hôm nay')).toBeOnTheScreen();
    expect(screen.getByText('Bạn đã ôn 12 thẻ · chuỗi ôn 3 ngày')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Ôn ngay' })).toBeNull();
  });

  it('chưa từng ôn và hôm nay không có thẻ ⇒ ẩn (không nói dối "đã hoàn thành")', async () => {
    api.summary.mockResolvedValue(summary({ dueToday: 0, newToday: 0, reviewedToday: 0 }));
    await renderWithProviders(<HomeSrTodayWidget />);

    await waitFor(() => expect(api.summary).toHaveBeenCalled());
    // Khung xương lúc tải cũng mang tiêu đề — chờ nó biến mất mới chắc widget đã ẩn.
    await waitFor(() => expect(screen.queryByText('Ôn tập hôm nay')).toBeNull());
  });

  it('cờ `study` tắt ⇒ ẩn và KHÔNG gọi API', async () => {
    flag.mockReturnValue(false);
    await renderWithProviders(<HomeSrTodayWidget />);

    expect(screen.queryByText('Ôn tập hôm nay')).toBeNull();
    await waitFor(() => expect(api.summary).not.toHaveBeenCalled());
  });

  it('lỗi tải ⇒ ẩn', async () => {
    api.summary.mockRejectedValue(new Error('mạng'));
    await renderWithProviders(<HomeSrTodayWidget />);

    await waitFor(() => expect(api.summary).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByText('Ôn tập hôm nay')).toBeNull());
  });

  it('đăng ký ở `register-home-widgets` ⇒ hiện qua khe Trang chủ', async () => {
    await renderWithProviders(<HomeWidgetsSlot />);

    expect(await screen.findByText('12 thẻ cần ôn')).toBeOnTheScreen();
  });
});
