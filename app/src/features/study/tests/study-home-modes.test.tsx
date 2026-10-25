import { fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import { router } from 'expo-router';

import { useFeature } from '@/shell/capabilities';

import { srService } from '../api/sr.service';
import { studyService } from '../api/study.service';
import { StudyHomeScreen } from '../screens/StudyHomeScreen';
import { makeSetSummary, makeSrSummary } from './home-fixtures';
import { renderWithProviders } from './render-helpers';

/**
 * Lưới lối tắt chế độ học ở Trang chủ Học theo `STUDY_MODE_META`: Học thẻ · Quiz nhanh · Thi thử cần chọn bộ (tấm chọn bộ, lọc theo năng lực thật của bộ); Ôn theo lịch ·
 * Thi đấu trực tiếp mở thẳng. Cờ `live-quiz` tắt ⇒ không có ô "Thi đấu trực tiếp"; chưa có bộ ⇒ không có hai ô cần bộ; đang tìm/lọc ⇒ cả khối đầu ẩn.
 * Thẻ "Hôm nay" ở `study-home-today.test.tsx`.
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

describe('StudyHome — lưới lối tắt chế độ học', () => {
  it('có bộ + cờ bật ⇒ năm ô, mỗi ô là một nút có nhãn chữ', async () => {
    sr.summary.mockResolvedValue(makeSrSummary({ dueToday: 0, newToday: 0, reviewedToday: 0 }));
    await renderWithProviders(<StudyHomeScreen />);
    await screen.findAllByLabelText(/^Bộ học thử/);

    for (const name of ['Học thẻ', 'Quiz nhanh', 'Thi thử', 'Ôn theo lịch', 'Thi đấu trực tiếp']) {
      expect(screen.getByRole('button', { name })).toBeOnTheScreen();
    }
  });

  it('"Ôn theo lịch" mở /study/sr; "Thi đấu trực tiếp" mở màn nhập mã PIN', async () => {
    sr.summary.mockResolvedValue(makeSrSummary({ dueToday: 0, newToday: 0, reviewedToday: 0 }));
    await renderWithProviders(<StudyHomeScreen />);
    await screen.findAllByLabelText(/^Bộ học thử/);

    await fireEvent.press(screen.getByRole('button', { name: 'Ôn theo lịch' }));
    expect(router.push).toHaveBeenLastCalledWith({ pathname: '/study/sr' });

    await fireEvent.press(screen.getByRole('button', { name: 'Thi đấu trực tiếp' }));
    expect(router.push).toHaveBeenLastCalledWith('/study/live/join');
  });

  it('cờ live-quiz tắt ⇒ còn bốn ô, không có "Thi đấu trực tiếp"', async () => {
    flag.mockReturnValue(false);
    await renderWithProviders(<StudyHomeScreen />);
    await screen.findAllByLabelText(/^Bộ học thử/);

    expect(screen.queryByRole('button', { name: 'Thi đấu trực tiếp' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Thi thử' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Quiz nhanh' })).toBeOnTheScreen();
  });

  it('"Học thẻ" mở tấm chọn bộ; chọn một bộ ⇒ đóng tấm rồi vào thẳng màn học thẻ của bộ đó', async () => {
    study.list.mockResolvedValue({
      items: [
        makeSetSummary({ id: 's1', title: 'Bộ Toán' }),
        makeSetSummary({ id: 's2', title: 'Bộ Lý' }),
      ],
      meta: PAGE,
    });
    await renderWithProviders(<StudyHomeScreen />);
    await screen.findAllByLabelText(/^Bộ Toán/);

    await fireEvent.press(screen.getByRole('button', { name: 'Học thẻ' }));
    expect(await screen.findByText('Chọn bộ để học thẻ')).toBeOnTheScreen();
    await fireEvent.press(within(screen.getByLabelText('Chọn bộ để học thẻ')).getByText('Bộ Lý'));

    await waitFor(() =>
      expect(router.push).toHaveBeenCalledWith({
        params: { setId: 's2' },
        pathname: '/study/sets/[setId]/flashcards',
      }),
    );
  });

  it('"Thi thử" chỉ liệt kê bộ có câu chấm điểm được (hasQuiz), rồi mở màn thiết lập thi thử', async () => {
    study.list.mockResolvedValue({
      items: [
        makeSetSummary({ hasQuiz: false, id: 's1', title: 'Chỉ thẻ ghi nhớ' }),
        makeSetSummary({ hasQuiz: true, id: 's2', title: 'Có trắc nghiệm' }),
      ],
      meta: PAGE,
    });
    await renderWithProviders(<StudyHomeScreen />);
    await screen.findAllByLabelText(/^Có trắc nghiệm/);

    await fireEvent.press(screen.getByRole('button', { name: 'Thi thử' }));
    expect(await screen.findByText('Chọn bộ để thi thử')).toBeOnTheScreen();
    const menu = screen.getByLabelText('Chọn bộ để thi thử');
    expect(within(menu).queryByText('Chỉ thẻ ghi nhớ')).toBeNull();
    await fireEvent.press(within(menu).getByText('Có trắc nghiệm'));

    await waitFor(() =>
      expect(router.push).toHaveBeenCalledWith({
        params: { setId: 's2' },
        pathname: '/study/sets/[setId]/mock',
      }),
    );
  });

  it('không bộ nào đủ điều kiện thi thử ⇒ tấm nói rõ, không có hàng nào để bấm', async () => {
    study.list.mockResolvedValue({ items: [makeSetSummary({ hasQuiz: false })], meta: PAGE });
    await renderWithProviders(<StudyHomeScreen />);
    await screen.findAllByLabelText(/^Bộ học thử/);

    await fireEvent.press(screen.getByRole('button', { name: 'Thi thử' }));

    expect(await screen.findByText('Chưa có bộ phù hợp')).toBeOnTheScreen();
    expect(screen.queryByLabelText('Chọn bộ để thi thử')).toBeNull();
  });

  it('chưa có bộ nào ⇒ ẩn "Học thẻ"/"Quiz nhanh"/"Thi thử" (chỉ dẫn tới tấm rỗng), vẫn còn ô không cần bộ; nút "Tạo bộ học" vẫn chỉ MỘT', async () => {
    study.list.mockResolvedValue({ items: [], meta: PAGE });
    sr.summary.mockResolvedValue(makeSrSummary({ dueToday: 0, newToday: 0, reviewedToday: 0 }));
    await renderWithProviders(<StudyHomeScreen />);
    expect(await screen.findByText('Chưa có bộ học')).toBeOnTheScreen();

    expect(screen.queryByRole('button', { name: 'Học thẻ' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Thi thử' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Quiz nhanh' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Thi đấu trực tiếp' })).toBeOnTheScreen();
    expect(screen.getAllByRole('button', { name: 'Tạo bộ học' })).toHaveLength(1);
  });

  it('chưa có bộ nào và không có thi trực tiếp ⇒ không vẽ lưới (một ô "Ôn theo lịch" lẻ không dẫn đi đâu)', async () => {
    flag.mockReturnValue(false);
    study.list.mockResolvedValue({ items: [], meta: PAGE });
    await renderWithProviders(<StudyHomeScreen />);
    expect(await screen.findByText('Chưa có bộ học')).toBeOnTheScreen();

    expect(screen.queryByText('Chế độ học')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Ôn theo lịch' })).toBeNull();
  });

  it('đang tìm ⇒ cả khối đầu (thẻ Hôm nay + lưới) ẩn để kết quả lên đầu màn', async () => {
    await renderWithProviders(<StudyHomeScreen />);
    expect(await screen.findByText('12 thẻ cần ôn hôm nay')).toBeOnTheScreen();

    await fireEvent.changeText(screen.getByPlaceholderText('Tìm bộ học'), 'toán');

    await waitFor(() => expect(screen.queryByText('12 thẻ cần ôn hôm nay')).toBeNull());
    expect(screen.queryByRole('button', { name: 'Học thẻ' })).toBeNull();
  });
});

describe('StudyHome — tab Khám phá', () => {
  it('hiện giới thiệu cộng đồng ở đầu danh sách; KHÔNG có thẻ Hôm nay/lưới chế độ', async () => {
    await renderWithProviders(<StudyHomeScreen />);
    await screen.findAllByLabelText(/^Bộ học thử/);

    await fireEvent.press(screen.getByRole('tab', { name: 'Khám phá' }));

    expect(await screen.findByText('Bộ học từ cộng đồng')).toBeOnTheScreen();
    expect(screen.queryByText('Chế độ học')).toBeNull();
    expect(screen.queryByText(/thẻ cần ôn hôm nay/)).toBeNull();
  });
});
