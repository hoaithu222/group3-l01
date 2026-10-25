import { fireEvent, screen } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { useConnectionState } from '@/core/socket';

import { mockAttemptsService } from '../api/mock-attempts.service';
import { MockHistoryScreen } from '../screens/MockHistoryScreen';
import { scoreDeltas } from '../utils/mock-history-utils';
import { makeSummaryRow } from './history-sr-fixtures';
import { apiError, renderWithProviders } from './render-helpers';

/** Lịch sử thi (README p4-02 §1, P1): đủ trạng thái, lượt dở mở lại màn thi, chênh lệch điểm so với lượt trước cùng bộ. */
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
  jest.mocked(useLocalSearchParams).mockReturnValue({});
  jest.mocked(useConnectionState).mockReturnValue('connected');
});

describe('scoreDeltas', () => {
  it('so với lượt CŨ HƠN cùng bộ; lượt dở/lượt đầu tiên của bộ không có khoá', () => {
    const rows = [
      makeSummaryRow('r1', { scorePct: 80 }),
      makeSummaryRow('rb', { scorePct: 60, setId: 's2' }),
      makeSummaryRow('rd', { passed: null, scorePct: null, status: 'IN_PROGRESS' }),
      makeSummaryRow('r2', { scorePct: 70 }),
      makeSummaryRow('r3', { scorePct: 90 }),
    ];
    expect(scoreDeltas(rows)).toEqual({ r1: 10, r2: -20 });
  });
});

describe('MockHistoryScreen', () => {
  it('hiện điểm, Đạt/Chưa đạt bằng chữ, chênh lệch; bấm lượt xong → kết quả, lượt dở → tiếp tục làm', async () => {
    api.listMine.mockResolvedValue(
      page([
        makeSummaryRow('r1', { scorePct: 80 }),
        makeSummaryRow('r2', { passed: false, scorePct: 70, submitMode: 'AUTO' }),
        makeSummaryRow('r3', {
          passed: null,
          scorePct: null,
          setTitle: 'Bộ đang làm',
          status: 'IN_PROGRESS',
        }),
      ]),
    );
    await renderWithProviders(<MockHistoryScreen />);

    expect(await screen.findByText('80%')).toBeOnTheScreen();
    expect(screen.getByText('+10 điểm')).toBeOnTheScreen();
    expect(screen.getByText('Chưa đạt')).toBeOnTheScreen();
    expect(screen.getByText(/Tự nộp/)).toBeOnTheScreen();
    expect(screen.getByText('Đang làm dở')).toBeOnTheScreen();

    await fireEvent.press(screen.getByLabelText(/^Bộ học thử\. .*80%, đạt/));
    expect(router.push).toHaveBeenCalledWith({
      params: { attemptId: 'r1' },
      pathname: '/study/results/[attemptId]',
    });
    await fireEvent.press(screen.getByText('Tiếp tục làm bài'));
    expect(router.push).toHaveBeenCalledWith({
      params: { attemptId: 'r3' },
      pathname: '/study/attempts/[attemptId]',
    });
  });

  it('có ?setId= → chỉ lịch sử của bộ đó (GET /study-sets/:id/mock-attempts)', async () => {
    jest.mocked(useLocalSearchParams).mockReturnValue({ setId: 's1' });
    api.listBySet.mockResolvedValue(page([makeSummaryRow('r1')]));
    await renderWithProviders(<MockHistoryScreen />);

    expect(await screen.findByText('80%')).toBeOnTheScreen();
    expect(api.listBySet).toHaveBeenCalledWith('s1', undefined);
    expect(api.listMine).not.toHaveBeenCalled();
  });

  it('rỗng → hướng dẫn làm bài thi thử', async () => {
    api.listMine.mockResolvedValue(page([]));
    await renderWithProviders(<MockHistoryScreen />);
    expect(await screen.findByText('Chưa có lượt thi nào')).toBeOnTheScreen();
  });

  it('lỗi → thông báo + nút Thử lại tải lại được', async () => {
    api.listMine.mockRejectedValueOnce(apiError(500, 'SYS_001'));
    api.listMine.mockResolvedValue(page([makeSummaryRow('r1')]));
    await renderWithProviders(<MockHistoryScreen />);

    expect(await screen.findByText('Không tải được lịch sử thi')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Thử lại'));
    expect(await screen.findByText('80%')).toBeOnTheScreen();
  });

  it('offline: vẫn hiện dữ liệu đã tải kèm ghi chú', async () => {
    jest.mocked(useConnectionState).mockReturnValue('offline');
    api.listMine.mockResolvedValue(page([makeSummaryRow('r1')]));
    await renderWithProviders(<MockHistoryScreen />);

    expect(await screen.findByText(/Đang offline/)).toBeOnTheScreen();
    expect(screen.getByText('80%')).toBeOnTheScreen();
  });
});
