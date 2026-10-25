import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';

import { useFeature } from '@/shell/capabilities';

import { srService } from '../api/sr.service';
import { studyService } from '../api/study.service';
import { StudyHomeScreen } from '../screens/StudyHomeScreen';
import { makeSetSummary, makeSrSummary } from './home-fixtures';
import { renderWithProviders } from './render-helpers';

/**
 * Thẻ "Hôm nay" ở đầu Trang chủ Học: dữ liệu THẬT của `GET /sr/summary` (số cần ôn, đã ôn, chuỗi ôn), vòng tiến độ = đã ôn ÷ (đã ôn + còn phải ôn), MỘT nút
 * "Ôn ngay" (rung nhẹ). Hết thẻ mà đã ôn ⇒ "Đã hoàn thành hôm nay"; hết thẻ mà chưa từng ôn, hoặc lỗi ⇒ ẩn. Lưới lối tắt ở `study-home-modes.test.tsx`.
 */
// Vòng tiến độ chạy dần (`useSweep`) và các khối vào màn (`EnterView`) đổi state theo khung hình — ngoài `act` của test nên React báo cảnh báo;
// bật "Giảm chuyển động" để test xác định (chạy dần có test riêng ở `use-sweep.test.tsx`).
jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  ...jest.requireActual('react-native-reanimated'),
  useReducedMotion: () => true,
}));
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: jest.fn(() => ({})),
}));
jest.mock('@shopify/flash-list', () => ({
  FlashList: jest.requireActual('react-native').FlatList,
}));
jest.mock('@/core/socket', () => ({ useConnectionState: () => 'connected' }));
jest.mock('@/shell/capabilities', () => ({
  useCapabilities: () => ({ data: undefined }),
  useFeature: jest.fn(() => true),
}));
jest.mock('../api/study.service', () => ({
  studyService: { list: jest.fn(), popularTags: jest.fn() },
}));
jest.mock('../api/sr.service', () => ({
  ...jest.requireActual('../api/sr.service'),
  srService: { summary: jest.fn() },
}));

const study = jest.mocked(studyService);
const sr = jest.mocked(srService);
const flag = jest.mocked(useFeature);
const PAGE = { hasMore: false, limit: 30, nextCursor: null };

beforeEach(() => {
  jest.clearAllMocks();
  flag.mockReturnValue(true);
  study.list.mockResolvedValue({ items: [makeSetSummary()], meta: PAGE });
  study.popularTags.mockResolvedValue([]);
  sr.summary.mockResolvedValue(makeSrSummary());
});

describe('StudyHome — thẻ "Hôm nay"', () => {
  it('còn thẻ ⇒ số thẻ, chi tiết, vòng tiến độ (đã ôn ÷ tổng) và chuỗi ôn — toàn số THẬT của API', async () => {
    await renderWithProviders(<StudyHomeScreen />);

    expect(await screen.findByText('12 thẻ cần ôn hôm nay')).toBeOnTheScreen();
    expect(screen.getByText('5 đến hạn · 7 thẻ mới')).toBeOnTheScreen();
    // 8 đã ôn / (8 + 12 còn lại) = 40%.
    expect(screen.getByText('40%')).toBeOnTheScreen();
    expect(screen.getByLabelText('Tiến độ ôn hôm nay: đã ôn 8, còn 12 thẻ')).toBeOnTheScreen();
    expect(screen.getByText('Đã ôn 8 thẻ')).toBeOnTheScreen();
    expect(screen.getByText('Chuỗi ôn 3 ngày')).toBeOnTheScreen();
  });

  it('số cần ôn (chạy số) là MỘT tiêu đề đọc câu với số CUỐI; vòng tiến độ vẫn là một progressbar có giá trị', async () => {
    await renderWithProviders(<StudyHomeScreen />);

    expect(await screen.findByRole('header', { name: '12 thẻ cần ôn hôm nay' })).toBeOnTheScreen();
    expect(
      screen.getByRole('progressbar', { name: 'Tiến độ ôn hôm nay: đã ôn 8, còn 12 thẻ' }),
    ).toHaveAccessibilityValue({ max: 100, min: 0, now: 40 });
  });

  it('"Ôn ngay" là nút chính: mở /study/sr (mọi bộ) và rung nhẹ', async () => {
    await renderWithProviders(<StudyHomeScreen />);

    await fireEvent.press(await screen.findByRole('button', { name: 'Ôn ngay' }));

    expect(Haptics.impactAsync).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Light);
    expect(router.push).toHaveBeenCalledWith({ pathname: '/study/sr' });
  });

  it('chưa ôn thẻ nào và không có chuỗi ⇒ không vẽ viên "Đã ôn"/"Chuỗi ôn" (không hiện số 0 vô nghĩa)', async () => {
    sr.summary.mockResolvedValue(makeSrSummary({ reviewStreakDays: 0, reviewedToday: 0 }));
    await renderWithProviders(<StudyHomeScreen />);

    expect(await screen.findByText('12 thẻ cần ôn hôm nay')).toBeOnTheScreen();
    expect(screen.getByText('0%')).toBeOnTheScreen();
    expect(screen.queryByText(/^Đã ôn \d+ thẻ$/)).toBeNull();
    expect(screen.queryByText(/Chuỗi ôn/)).toBeNull();
  });

  it('hết thẻ mà hôm nay đã ôn ⇒ "Đã hoàn thành hôm nay", KHÔNG có nút "Ôn ngay"', async () => {
    sr.summary.mockResolvedValue(makeSrSummary({ dueToday: 0, newToday: 0, reviewedToday: 12 }));
    await renderWithProviders(<StudyHomeScreen />);

    expect(await screen.findByText('Đã hoàn thành hôm nay')).toBeOnTheScreen();
    expect(screen.getByText('Bạn đã ôn 12 thẻ · chuỗi ôn 3 ngày')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Ôn ngay' })).toBeNull();
    // Trạng thái "xong" là thẻ tĩnh: hình tick trang trí thay cho vòng tiến độ — không còn gì chạy/đếm.
    expect(screen.queryByRole('progressbar', { name: /Tiến độ ôn hôm nay/ })).toBeNull();
  });

  it('hết thẻ và CHƯA từng ôn ⇒ ẩn (không nói dối "đã hoàn thành")', async () => {
    sr.summary.mockResolvedValue(makeSrSummary({ dueToday: 0, newToday: 0, reviewedToday: 0 }));
    await renderWithProviders(<StudyHomeScreen />);
    await waitFor(() => expect(sr.summary).toHaveBeenCalled());
    await screen.findAllByLabelText(/^Bộ học thử/);

    expect(screen.queryByText('Đã hoàn thành hôm nay')).toBeNull();
    expect(screen.queryByText(/thẻ cần ôn hôm nay/)).toBeNull();
  });

  it('lỗi tải số đếm ⇒ ẩn thẻ, phần còn lại của màn vẫn dùng được', async () => {
    sr.summary.mockRejectedValue(new Error('mạng'));
    await renderWithProviders(<StudyHomeScreen />);
    await screen.findAllByLabelText(/^Bộ học thử/);

    expect(screen.queryByText(/thẻ cần ôn hôm nay/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Học thẻ' })).toBeOnTheScreen();
  });
});
