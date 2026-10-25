import { fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import { router } from 'expo-router';

import { useFeature } from '@/shell/capabilities';

import { srService } from '../api/sr.service';
import { studyService } from '../api/study.service';
import { STUDY_MODE_META } from '../constants/study-modes.constants';
import { SetOverviewScreen } from '../screens/SetOverviewScreen';
import { StudyHomeScreen } from '../screens/StudyHomeScreen';
import { quizHref } from '../utils/study-routes';
import { makeItem, makeSet } from './fixtures';
import { makeSetSummary, makeSrSummary } from './home-fixtures';
import { renderWithProviders } from './render-helpers';

/** Lối vào "Quiz nhanh": ô ở lưới chế độ Trang chủ Học (tấm chọn bộ, lọc theo `hasQuiz`), ô "Luyện tập" ở tổng quan bộ (ẩn khi bộ không có câu chấm được), bản sắc + route. */
jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  ...jest.requireActual('react-native-reanimated'),
  useReducedMotion: () => true,
}));
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: jest.fn(() => ({ setId: 's1' })),
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
  studyService: {
    get: jest.fn(),
    items: jest.fn(),
    list: jest.fn(),
    popularTags: jest.fn(),
    workspaceAccess: jest.fn(),
  },
}));
jest.mock('../api/sr.service', () => ({
  ...jest.requireActual('../api/sr.service'),
  srService: { enroll: jest.fn(), summary: jest.fn(), unenroll: jest.fn() },
}));

const study = jest.mocked(studyService);
const flag = jest.mocked(useFeature);
const PAGE = { hasMore: false, limit: 30, nextCursor: null };
const QUIZ_S2 = { params: { setId: 's2' }, pathname: '/study/sets/[setId]/quiz' };

beforeEach(() => {
  jest.clearAllMocks();
  flag.mockReturnValue(true);
  study.list.mockResolvedValue({ items: [makeSetSummary()], meta: PAGE });
  study.popularTags.mockResolvedValue([]);
  jest.mocked(srService.summary).mockResolvedValue(makeSrSummary());
  study.get.mockResolvedValue(makeSet());
  study.items.mockResolvedValue({ items: [makeItem()], setVersion: 1 });
});

describe('bản sắc và route', () => {
  it('"Quiz nhanh": tông accent, icon `play`; bốn chế độ cũ giữ NGUYÊN chữ/tông/icon', () => {
    expect(STUDY_MODE_META.quick).toMatchObject({
      icon: 'play',
      label: 'Quiz nhanh',
      tone: 'accent',
    });
    expect(STUDY_MODE_META.flashcards).toMatchObject({
      icon: 'copy',
      label: 'Học thẻ',
      tone: 'brand',
    });
    expect(STUDY_MODE_META.live).toMatchObject({ icon: 'flash', tone: 'warning' });
    expect(STUDY_MODE_META.mock).toMatchObject({ icon: 'timer', label: 'Thi thử', tone: 'info' });
    expect(STUDY_MODE_META.sr).toMatchObject({ label: 'Ôn theo lịch', tone: 'success' });
  });

  it('quizHref trỏ tới route /study/sets/[setId]/quiz', () => {
    expect(quizHref('s2')).toEqual(QUIZ_S2);
  });
});

describe('Trang chủ Học — ô "Quiz nhanh"', () => {
  it('mở tấm chọn bộ CHỈ liệt kê bộ có câu chấm được (hasQuiz), chọn một bộ ⇒ vào thẳng Quiz nhanh', async () => {
    study.list.mockResolvedValue({
      items: [
        makeSetSummary({ hasQuiz: false, id: 's1', title: 'Chỉ thẻ ghi nhớ' }),
        makeSetSummary({ hasQuiz: true, id: 's2', title: 'Có trắc nghiệm' }),
      ],
      meta: PAGE,
    });
    await renderWithProviders(<StudyHomeScreen />);
    await screen.findAllByLabelText(/^Có trắc nghiệm/);

    await fireEvent.press(screen.getByRole('button', { name: 'Quiz nhanh' }));
    expect(await screen.findByText('Chọn bộ để chơi Quiz nhanh')).toBeOnTheScreen();
    const menu = screen.getByLabelText('Chọn bộ để chơi Quiz nhanh');
    expect(within(menu).queryByText('Chỉ thẻ ghi nhớ')).toBeNull();
    await fireEvent.press(within(menu).getByText('Có trắc nghiệm'));

    await waitFor(() => expect(router.push).toHaveBeenCalledWith(QUIZ_S2));
  });

  it('không bộ nào có câu chấm được ⇒ tấm nói rõ, không hàng nào để bấm', async () => {
    study.list.mockResolvedValue({ items: [makeSetSummary({ hasQuiz: false })], meta: PAGE });
    await renderWithProviders(<StudyHomeScreen />);
    await screen.findAllByLabelText(/^Bộ học thử/);

    await fireEvent.press(screen.getByRole('button', { name: 'Quiz nhanh' }));

    expect(await screen.findByText('Chưa có bộ phù hợp')).toBeOnTheScreen();
    expect(
      screen.getByText('Chưa có bộ nào có câu hỏi chấm điểm được để chơi Quiz nhanh.'),
    ).toBeOnTheScreen();
    expect(screen.queryByLabelText('Chọn bộ để chơi Quiz nhanh')).toBeNull();
  });
});

describe('Tổng quan bộ — ô "Quiz nhanh"', () => {
  it('bộ có câu chấm được ⇒ có ô, bấm mở Quiz nhanh của bộ', async () => {
    await renderWithProviders(<SetOverviewScreen />);

    await fireEvent.press(await screen.findByRole('button', { name: 'Quiz nhanh' }));

    expect(router.push).toHaveBeenCalledWith({
      params: { setId: 's1' },
      pathname: '/study/sets/[setId]/quiz',
    });
  });

  it('bộ chỉ có thẻ ghi nhớ (hasQuiz = false) ⇒ ẨN ô "Quiz nhanh", các ô khác vẫn còn', async () => {
    study.get.mockResolvedValue(makeSet({ hasQuiz: false, itemTypesMask: 1 }));
    await renderWithProviders(<SetOverviewScreen />);
    await screen.findByRole('button', { name: 'Học thẻ' });

    expect(screen.queryByRole('button', { name: 'Quiz nhanh' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Ôn theo lịch' })).toBeOnTheScreen();
  });
});
