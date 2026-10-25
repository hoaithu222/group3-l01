import { fireEvent, screen } from '@testing-library/react-native';

import { useFeature } from '@/shell/capabilities';

import { srService } from '../api/sr.service';
import { studyService } from '../api/study.service';
import { StudyHomeScreen } from '../screens/StudyHomeScreen';
import { makeSetSummary, makeSrSummary } from './home-fixtures';
import { renderWithProviders } from './render-helpers';

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
  flag.mockReturnValue(false);
  study.list.mockResolvedValue({ items: [makeSetSummary()], meta: PAGE });
  study.popularTags.mockResolvedValue([]);
  sr.summary.mockResolvedValue(makeSrSummary());
});

describe('StudyHome - explore filters', () => {
  it('lọc rỗng vẫn bỏ chọn được thẻ; thẻ Khám phá không làm mất trạng thái rỗng/Tạo bộ học ở Của tôi', async () => {
    study.popularTags.mockResolvedValue([{ count: 1, tag: 'toán' }]);
    study.list.mockResolvedValue({ items: [], meta: PAGE });
    await renderWithProviders(<StudyHomeScreen />);
    await screen.findByText('Chưa có bộ học');

    await fireEvent.press(screen.getByRole('tab', { name: 'Khám phá' }));
    await fireEvent.press(await screen.findByRole('button', { name: '#toán' }));
    expect(await screen.findByText('Không có kết quả')).toBeOnTheScreen();
    expect(screen.queryByText('Bộ học từ cộng đồng')).toBeNull();
    expect(screen.getByRole('button', { name: '#toán' })).toBeSelected();

    await fireEvent.press(screen.getByRole('tab', { name: 'Của tôi' }));
    expect(await screen.findByText('Chưa có bộ học')).toBeOnTheScreen();
    expect(screen.getAllByRole('button', { name: 'Tạo bộ học' })).toHaveLength(1);

    await fireEvent.press(screen.getByRole('tab', { name: 'Khám phá' }));
    expect(screen.getByRole('button', { name: '#toán' })).toBeSelected();
    await fireEvent.press(screen.getByRole('button', { name: '#toán' }));
    expect(await screen.findByText('Chưa có gì để khám phá')).toBeOnTheScreen();
    expect(screen.getByText('Bộ học từ cộng đồng')).toBeOnTheScreen();
  });
});
