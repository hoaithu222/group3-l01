import { screen } from '@testing-library/react-native';

import { useConnectionState } from '@/core/socket';

import { mockAttemptsService } from '../api/mock-attempts.service';
import { MockHistoryScreen } from '../screens/MockHistoryScreen';
import { makeSummaryRow } from './history-sr-fixtures';
import { renderWithProviders } from './render-helpers';

/** Lịch sử thi: thống kê + xu hướng ở đầu danh sách, và dáng hàng lịch sử (vòng điểm, thời gian làm) — chỉ dùng dữ liệu đã tải. */
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: jest.fn(() => ({})),
}));
jest.mock('@shopify/flash-list', () => ({
  FlashList: jest.requireActual('react-native').FlatList,
}));
jest.mock('@/core/socket', () => ({ useConnectionState: jest.fn(() => 'connected') }));
jest.mock('../api/mock-attempts.service', () => ({
  ...jest.requireActual('../api/mock-attempts.service'),
  mockAttemptsService: { listBySet: jest.fn(), listMine: jest.fn() },
}));

const api = jest.mocked(mockAttemptsService);
const page = (items: ReturnType<typeof makeSummaryRow>[]) => ({
  items,
  meta: { hasMore: false, limit: 20, nextCursor: null },
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(useConnectionState).mockReturnValue('connected');
});

describe('thống kê và xu hướng ở đầu danh sách', () => {
  it('có từ 3 lượt cùng bộ: số lượt · trung bình · cao nhất, biểu đồ các lượt gần nhất kèm xu hướng bằng chữ', async () => {
    api.listMine.mockResolvedValue(
      page([
        makeSummaryRow('r1', { scorePct: 80 }),
        makeSummaryRow('r2', { scorePct: 70 }),
        makeSummaryRow('r3', { scorePct: 60 }),
      ]),
    );
    await renderWithProviders(<MockHistoryScreen />);

    expect(await screen.findByText('Lượt đã thi')).toBeOnTheScreen();
    expect(screen.getByText('Điểm trung bình')).toBeOnTheScreen();
    expect(screen.getByText('Điểm cao nhất')).toBeOnTheScreen();
    expect(screen.getByText('3 lượt gần nhất')).toBeOnTheScreen();
    expect(screen.getByText('Đang tiến bộ')).toBeOnTheScreen(); // 60 → 70 → 80: chữ + mũi tên, không chỉ màu
    expect(
      screen.getByLabelText(
        /^3 lượt đã thi; điểm trung bình 70 phần trăm; cao nhất 80 phần trăm; điểm các lượt gần đây từ cũ đến mới: 60, 70, 80$/,
      ),
    ).toBeOnTheScreen();
  });

  it('mới 2 lượt: có thống kê nhưng CHƯA kết luận xu hướng', async () => {
    api.listMine.mockResolvedValue(
      page([makeSummaryRow('r1', { scorePct: 80 }), makeSummaryRow('r2', { scorePct: 40 })]),
    );
    await renderWithProviders(<MockHistoryScreen />);

    expect(await screen.findByText('2 lượt gần nhất')).toBeOnTheScreen();
    expect(screen.queryByText('Đang tiến bộ')).toBeNull();
    expect(screen.queryByText('Đang giảm')).toBeNull();
  });

  it('nhiều bộ khác nhau: chỉ thống kê chung, KHÔNG vẽ xu hướng (so điểm hai đề khác nhau là vô nghĩa)', async () => {
    api.listMine.mockResolvedValue(
      page([
        makeSummaryRow('r1', { scorePct: 80 }),
        makeSummaryRow('r2', { scorePct: 40, setId: 's2' }),
        makeSummaryRow('r3', { scorePct: 60 }),
      ]),
    );
    await renderWithProviders(<MockHistoryScreen />);

    expect(await screen.findByText('Lượt đã thi')).toBeOnTheScreen();
    expect(screen.queryByText(/lượt gần nhất/)).toBeNull();
  });

  it('chỉ có lượt đang dở ⇒ không có thống kê (chưa có điểm nào để thống kê)', async () => {
    api.listMine.mockResolvedValue(
      page([makeSummaryRow('r1', { passed: null, scorePct: null, status: 'IN_PROGRESS' })]),
    );
    await renderWithProviders(<MockHistoryScreen />);

    expect(await screen.findByText('Tiếp tục làm bài')).toBeOnTheScreen();
    expect(screen.queryByText('Lượt đã thi')).toBeNull();
  });
});

describe('hàng lịch sử', () => {
  it('điểm nằm trong vòng nhỏ; kết quả luôn có CHỮ; điểm lẻ dùng dấu phẩy', async () => {
    api.listMine.mockResolvedValue(
      page([
        makeSummaryRow('r1', { correctCount: 2, scorePct: 66.7, total: 3 }),
        makeSummaryRow('r2', { passed: false, scorePct: 20 }),
      ]),
    );
    await renderWithProviders(<MockHistoryScreen />);

    expect(await screen.findByText('66,7%')).toBeOnTheScreen();
    expect(screen.getByText('Đạt')).toBeOnTheScreen();
    expect(screen.getByText('Chưa đạt')).toBeOnTheScreen();
    expect(
      screen.getByLabelText(/^Bộ học thử. .*66,7%, đạt, đúng 2 trên 3 câu, làm trong 10 phút$/),
    ).toBeOnTheScreen();
  });

  it('nêu thời gian làm bài cạnh số câu đúng (từ mốc bắt đầu và nộp)', async () => {
    api.listMine.mockResolvedValue(
      page([
        makeSummaryRow('r1', {
          startedAt: '2026-09-20T08:00:00.000Z',
          submittedAt: '2026-09-20T08:12:05.000Z',
        }),
      ]),
    );
    await renderWithProviders(<MockHistoryScreen />);

    expect(await screen.findByText('Đúng 8/10 câu · 12 phút 5 giây')).toBeOnTheScreen();
  });
});
