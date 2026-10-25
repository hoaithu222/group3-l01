import { fireEvent, screen } from '@testing-library/react-native';
import { router } from 'expo-router';

import { gamificationService } from '../api/gamification.service';
import { HomeActivityWidget } from '../components/home/HomeActivityWidget';
import { HomeStreakWidget } from '../components/home/HomeStreakWidget';
import { eventsPage, profile, renderWidget, settle, xpEvent } from './home-widgets-helpers';

/**
 * Widget thống kê ở Trang chủ (H2): "Chuỗi chăm chỉ" và "Hoạt động 7 ngày" (cấp độ/thành tích ở `HomeLevelWidget.test.tsx`). Test
 * HÀNH VI — ẩn khi cờ tắt (và không gọi API), ẩn khi lỗi, số liệu đúng, lối "Lịch sử" mở đúng màn. Sự kiện XP dựng theo đồng hồ
 * máy (`new Date()`) nên đúng ở mọi múi giờ.
 */

const mockFlag = { current: true };
// `AnimatedNumber` (số đếm lên) đổi state theo khung hình — ngoài `act` của test; bật "Giảm chuyển động" để số hiện NGAY.
jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  ...jest.requireActual('react-native-reanimated'),
  useReducedMotion: () => true,
}));
jest.mock('@/shell/capabilities', () => ({ useFeature: () => mockFlag.current }));
jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  useIsFocused: jest.fn(() => true),
}));

const meSpy = jest.spyOn(gamificationService, 'me');
const eventsSpy = jest.spyOn(gamificationService, 'xpEvents');

beforeEach(() => {
  jest.clearAllMocks();
  mockFlag.current = true;
  meSpy.mockResolvedValue(profile());
  eventsSpy.mockResolvedValue(eventsPage([xpEvent(0, 100), xpEvent(1, 50)]));
});

describe('HomeStreakWidget', () => {
  it('số ngày liên tiếp, kỷ lục và dải 7 ngày (hôm nay có hoạt động)', async () => {
    await renderWidget(<HomeStreakWidget />);

    // ⚠️ Chờ NỘI DUNG thật trước: khung xương cũng có tiêu đề "Chuỗi chăm chỉ", `findByText` sẽ bắt nhầm nó rồi nó bị thay mất.
    expect(await screen.findByText('4')).toBeOnTheScreen();
    expect(screen.getByText('Chuỗi chăm chỉ')).toBeOnTheScreen();
    expect(screen.getByText('ngày liên tiếp')).toBeOnTheScreen();
    expect(screen.getByText('Kỷ lục 9 ngày')).toBeOnTheScreen();
    expect(await screen.findByLabelText(/^Hôm nay, \d\d\/\d\d: có hoạt động$/)).toBeOnTheScreen();
    expect(screen.queryByText(/Làm một việc để giữ chuỗi/)).toBeNull();
    await settle();
  });

  it('streakAtRisk ⇒ nhắc nhẹ bằng chữ, và hôm nay là ô "chưa có hoạt động"', async () => {
    meSpy.mockResolvedValue(profile({ streak: 3, streakAtRisk: true }));
    eventsSpy.mockResolvedValue(eventsPage([xpEvent(1, 50)]));
    await renderWidget(<HomeStreakWidget />);

    expect(
      await screen.findByText('Hôm nay chưa có hoạt động. Làm một việc để giữ chuỗi.'),
    ).toBeOnTheScreen();
    expect(
      await screen.findByLabelText(/^Hôm nay, \d\d\/\d\d: chưa có hoạt động$/),
    ).toBeOnTheScreen();
    await settle();
  });

  it('chuỗi 0 ⇒ "Chưa có chuỗi" (không hiện "0 ngày" như thành tích)', async () => {
    meSpy.mockResolvedValue(profile({ longestStreak: 0, streak: 0 }));
    eventsSpy.mockResolvedValue(eventsPage([]));
    await renderWidget(<HomeStreakWidget />);

    expect(await screen.findByText('Hoạt động hôm nay để bắt đầu chuỗi')).toBeOnTheScreen();
    expect(screen.getAllByText('Chưa có chuỗi').length).toBeGreaterThan(0);
    expect(screen.queryByText('ngày liên tiếp')).toBeNull();
    await settle();
  });

  it('cờ `gamification` tắt ⇒ ẩn hẳn và KHÔNG gọi API', async () => {
    mockFlag.current = false;
    const view = await renderWidget(<HomeStreakWidget />);
    await settle();

    expect(view.toJSON()).toBeNull();
    expect(meSpy).not.toHaveBeenCalled();
    expect(eventsSpy).not.toHaveBeenCalled();
  });

  it('lỗi tải hồ sơ ⇒ ẩn (không lỗi ồn ào trên Trang chủ)', async () => {
    meSpy.mockRejectedValue(new Error('mạng'));
    const view = await renderWidget(<HomeStreakWidget />);
    await settle();

    expect(view.toJSON()).toBeNull();
  });

  it('lỗi tải sự kiện XP ⇒ VẪN vẽ thẻ, dải chấm theo chuỗi server báo', async () => {
    eventsSpy.mockRejectedValue(new Error('mạng'));
    await renderWidget(<HomeStreakWidget />);

    expect(await screen.findByText('Kỷ lục 9 ngày')).toBeOnTheScreen();
    expect(await screen.findByLabelText(/^Hôm nay, \d\d\/\d\d: có hoạt động$/)).toBeOnTheScreen();
    await settle();
  });
});

describe('HomeActivityWidget', () => {
  it('tổng XP 7 ngày, XP hôm nay và cột theo ngày; "Lịch sử" mở /me/xp-history', async () => {
    await renderWidget(<HomeActivityWidget />);

    expect(await screen.findByText('150 XP')).toBeOnTheScreen();
    expect(screen.getByText('Hoạt động 7 ngày')).toBeOnTheScreen();
    expect(screen.getByText('+100 XP')).toBeOnTheScreen();
    expect(screen.getByLabelText(/^Hôm nay, \d\d\/\d\d: 100 XP$/)).toBeOnTheScreen();
    expect(screen.getAllByLabelText(/: 0 XP$/)).toHaveLength(5);

    await fireEvent.press(screen.getByRole('button', { name: 'Xem lịch sử điểm kinh nghiệm' }));
    expect(router.push).toHaveBeenCalledWith('/me/xp-history');
    await settle();
  });

  it('7 ngày qua không có hoạt động nào ⇒ ẩn (không vẽ biểu đồ toàn cột rỗng)', async () => {
    eventsSpy.mockResolvedValue(eventsPage([]));
    const view = await renderWidget(<HomeActivityWidget />);
    await settle();

    expect(view.toJSON()).toBeNull();
  });

  it('cờ tắt ⇒ ẩn, không gọi API', async () => {
    mockFlag.current = false;
    const view = await renderWidget(<HomeActivityWidget />);
    await settle();

    expect(view.toJSON()).toBeNull();
    expect(eventsSpy).not.toHaveBeenCalled();
  });

  it('lỗi tải ⇒ ẩn', async () => {
    eventsSpy.mockRejectedValue(new Error('mạng'));
    const view = await renderWidget(<HomeActivityWidget />);
    await settle();

    expect(view.toJSON()).toBeNull();
  });
});
