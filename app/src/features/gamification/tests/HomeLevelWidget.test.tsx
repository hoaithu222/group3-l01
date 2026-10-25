import { fireEvent, screen } from '@testing-library/react-native';
import { router } from 'expo-router';

import { HomeWidgetsSlot } from '@/shared/home-widgets';

import { gamificationService } from '../api/gamification.service';
import { HomeLevelWidget } from '../components/home/HomeLevelWidget';
// Tác dụng phụ: đăng ký widget vào khe (giống `app/(app)/_layout.tsx`) — ca cuối kiểm khe vẽ đúng thứ tự.
import '../register-home-widgets';
import { eventsPage, profile, renderWidget, settle, xpEvent } from './home-widgets-helpers';

/**
 * Widget "Cấp độ và thành tích" ở Trang chủ (H2) + việc đăng ký cả ba widget gamification vào khe. Test HÀNH VI: lưới chỉ có
 * bộ đếm khác 0 (tất cả 0 ⇒ không có lưới), "Chi tiết" mở màn Thành tích, ẩn khi cờ tắt (không gọi API) hoặc lỗi.
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

describe('HomeLevelWidget', () => {
  it('cấp độ + lưới thành tích chỉ gồm bộ đếm khác 0; "Chi tiết" mở /me/achievements', async () => {
    meSpy.mockResolvedValue(
      profile({ counters: { srReviews: 30, tasksDone: 128, tasksOnTime: 0 } }),
    );
    await renderWidget(<HomeLevelWidget />);

    // ⚠️ Chờ NỘI DUNG thật trước: khung xương cũng có tiêu đề, `findByText` sẽ bắt nhầm nó rồi nó bị thay mất.
    expect(await screen.findByText('Cấp 12')).toBeOnTheScreen();
    expect(screen.getByText('Cấp độ và thành tích')).toBeOnTheScreen();
    expect(screen.getByLabelText('Việc hoàn thành: 128')).toBeOnTheScreen();
    expect(screen.getByLabelText('Lượt ôn thẻ: 30')).toBeOnTheScreen();
    expect(screen.queryByText('Đúng hạn')).toBeNull();

    await fireEvent.press(screen.getByRole('button', { name: 'Mở màn Thành tích' }));
    expect(router.push).toHaveBeenCalledWith('/me/achievements');
    await settle();
  });

  it('mọi bộ đếm bằng 0 ⇒ chỉ còn thẻ cấp độ, không có lưới', async () => {
    meSpy.mockResolvedValue(
      profile({ counters: { tasksDone: 0, srReviews: 0, longestStreak: 9 } }),
    );
    await renderWidget(<HomeLevelWidget />);

    expect(await screen.findByText('Cấp 12')).toBeOnTheScreen();
    expect(screen.queryByText('Việc hoàn thành')).toBeNull();
    expect(screen.queryByText('Lượt ôn thẻ')).toBeNull();
    await settle();
  });

  it('người mới (0 XP) ⇒ gợi ý việc đầu tiên bằng chữ', async () => {
    meSpy.mockResolvedValue(profile({ level: 1, streak: 0, xp: 0, xpIntoLevel: 0, xpToNext: 100 }));
    await renderWidget(<HomeLevelWidget />);

    expect(await screen.findByText('Hoàn thành việc đầu tiên để nhận XP')).toBeOnTheScreen();
    await settle();
  });

  it('cờ tắt ⇒ ẩn, không gọi API; lỗi ⇒ ẩn', async () => {
    mockFlag.current = false;
    const off = await renderWidget(<HomeLevelWidget />);
    await settle();
    expect(off.toJSON()).toBeNull();
    expect(meSpy).not.toHaveBeenCalled();

    mockFlag.current = true;
    meSpy.mockRejectedValue(new Error('mạng'));
    const failed = await renderWidget(<HomeLevelWidget />);
    await settle();
    expect(failed.toJSON()).toBeNull();
  });
});

describe('đăng ký vào khe Trang chủ', () => {
  it('ba widget hiện đúng thứ tự: chuỗi → hoạt động 7 ngày → cấp độ và thành tích', async () => {
    await renderWidget(<HomeWidgetsSlot />);

    await screen.findByText('150 XP');
    const titles = screen.getAllByRole('header').map((node) => node.props.children as string);
    expect(titles).toEqual(['Chuỗi chăm chỉ', 'Hoạt động 7 ngày', 'Cấp độ và thành tích']);
    await settle();
  });
});
