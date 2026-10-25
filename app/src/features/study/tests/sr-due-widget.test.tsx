import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import { ActivityWidgetsSlot } from '@/shared/activity-widgets';
import { useFeature } from '@/shell/capabilities';

import { srService } from '../api/sr.service';
import type { SrSummary } from '../api/sr.types';
import { SrDueWidget } from '../components/sr/SrDueWidget';
// Tác dụng phụ: đăng ký widget vào khe (giống `app/(app)/activity/_layout.tsx`) — ca cuối kiểm khe vẽ đúng.
import '../register-activity-widgets';
import { renderWithProviders } from './render-helpers';

/**
 * p4-02 app.md §3 "widget Hoạt động": "N thẻ cần ôn hôm nay" + Ôn ngay ở đầu tab Hoạt động. Số = đến hạn + thẻ mới còn trong ngân sách
 * ngày (`GET /sr/summary`); ẩn khi cờ `study` tắt, khi 0 thẻ, khi lỗi. Đăng ký qua khe để `features/activity` không import `study`.
 */
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
  reviewStreakDays: 2,
  reviewedToday: 0,
  serverNow: '2026-09-26T02:00:00.000Z',
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
  flag.mockReturnValue(true);
  api.summary.mockResolvedValue(summary());
});

describe('SrDueWidget', () => {
  it('đến hạn 5 + thẻ mới 7 → "12 thẻ cần ôn hôm nay"; "Ôn ngay" mở /study/sr (mọi bộ)', async () => {
    await renderWithProviders(<SrDueWidget />);

    expect(await screen.findByText('12 thẻ cần ôn hôm nay')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Ôn ngay' }));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/study/sr' });
  });

  it('hôm nay không còn thẻ nào → không vẽ gì', async () => {
    api.summary.mockResolvedValue(summary({ dueToday: 0, newToday: 0 }));
    await renderWithProviders(<SrDueWidget />);

    await waitFor(() => expect(api.summary).toHaveBeenCalled());
    expect(screen.queryByText(/thẻ cần ôn/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Ôn ngay' })).toBeNull();
  });

  it('cờ `study` tắt → không vẽ và KHÔNG gọi API', async () => {
    flag.mockReturnValue(false);
    await renderWithProviders(<SrDueWidget />);

    expect(screen.queryByText(/thẻ cần ôn/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Ôn ngay' })).toBeNull();
    await waitFor(() => expect(api.summary).not.toHaveBeenCalled());
  });

  it('lỗi tải → không vẽ gì', async () => {
    api.summary.mockRejectedValue(new Error('mạng'));
    await renderWithProviders(<SrDueWidget />);

    await waitFor(() => expect(api.summary).toHaveBeenCalled());
    expect(screen.queryByText(/thẻ cần ôn/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Ôn ngay' })).toBeNull();
  });

  it('đăng ký ở `register-activity-widgets` → hiện qua khe của tab Hoạt động', async () => {
    await renderWithProviders(<ActivityWidgetsSlot />);

    expect(await screen.findByText('12 thẻ cần ôn hôm nay')).toBeOnTheScreen();
  });
});
