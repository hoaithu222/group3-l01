import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import { useToastStore } from '@/shared/ui/feedback/toast-store';

import { srService } from '../api/sr.service';
import { SrReviewScreen } from '../screens/SrReviewScreen';
import { makeSrCard } from './history-sr-fixtures';
import { apiError, renderWithProviders } from './render-helpers';

/** Ôn theo lịch (README p4-02 §3, §4, §8): lỗi mạng vẫn sang thẻ kế và gửi lại CÙNG clientReviewId; hết thẻ hiện tóm tắt. */
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: jest.fn(() => ({ setId: 's1' })),
}));
jest.mock('../api/sr.service', () => ({
  ...jest.requireActual('../api/sr.service'),
  srService: { due: jest.fn(), review: jest.fn(), summary: jest.fn(), unenroll: jest.fn() },
}));

const api = jest.mocked(srService);
const network = () => Object.assign(new Error('Network Error'), { isAxiosError: true });
const advance = (ms: number) => act(async () => void (await jest.advanceTimersByTimeAsync(ms)));
const week = ['26', '27', '28', '29', '30', '01', '02'].map((d, i) => ({
  count: i === 0 ? 5 : 0,
  date: `2026-${i < 5 ? '09' : '10'}-${d}`,
}));

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  useToastStore.setState({ toasts: [] });
  api.due.mockResolvedValue({
    items: [makeSrCard('i1'), makeSrCard('i2')],
    remainingToday: 3,
    serverNow: '2026-09-25T02:00:00.000Z',
  });
  api.summary.mockResolvedValue({
    dueNext7Days: week,
    dueToday: 0,
    newToday: 0,
    reviewStreakDays: 3,
    reviewedToday: 2,
    serverNow: '2026-09-25T02:00:00.000Z',
  });
  api.review.mockResolvedValue({ progress: {} as never, remainingToday: 0 });
});
afterEach(() => jest.useRealTimers());

async function rateFirstCard(label: string) {
  await fireEvent.press(await screen.findByText('Hiện đáp án'));
  await fireEvent.press(screen.getByLabelText(new RegExp(`^Đánh giá: ${label}`)));
}

describe('SrReviewScreen — hàng đợi gửi lại', () => {
  it('lỗi mạng: vẫn sang thẻ kế NGAY, rồi gửi lại với CÙNG clientReviewId (backoff 1 giây)', async () => {
    api.review.mockRejectedValueOnce(network());
    await renderWithProviders(<SrReviewScreen />);
    expect(await screen.findByText('1/2')).toBeOnTheScreen();

    await rateFirstCard('Vừa');
    expect(await screen.findByText('2/2')).toBeOnTheScreen();
    expect(api.review).toHaveBeenCalledTimes(1);

    await advance(1000);
    expect(api.review).toHaveBeenCalledTimes(2);
    const [first, second] = api.review.mock.calls.map((call) => call[0]);
    expect(first?.clientReviewId).toMatch(/^srr-/);
    expect(second?.clientReviewId).toBe(first?.clientReviewId);
    expect(second).toMatchObject({ itemId: 'i1', rating: 'GOOD' });
  });

  it('lỗi nghiệp vụ 4xx (SR_001) KHÔNG gửi lại; báo "Thẻ không còn khả dụng"', async () => {
    api.review.mockRejectedValue(apiError(409, 'SR_001'));
    await renderWithProviders(<SrReviewScreen />);
    await rateFirstCard('Quên');
    await advance(3500); // quá cả hai mốc backoff đầu (1 s, 2 s) mà chưa hết hạn toast

    expect(api.review).toHaveBeenCalledTimes(1);
    expect(useToastStore.getState().toasts.map((t) => t.message)).toContain(
      'Thẻ không còn khả dụng.',
    );
  });

  it('chưa lật thì chỉ có "Hiện đáp án" (chưa cho chấm); lật rồi thì hàng bốn mức thay chỗ nút đó, kèm lời nhắc', async () => {
    await renderWithProviders(<SrReviewScreen />);
    expect(await screen.findByText('1/2')).toBeOnTheScreen();
    expect(screen.queryByLabelText(/^Đánh giá:/)).toBeNull();
    // Đầu phiên mang tên bộ của thẻ (không chỉ tên chế độ) và thẻ đọc lên cả "thẻ 1/2, mặt trước".
    expect(screen.getByText('Bộ học thử')).toBeOnTheScreen();
    expect(screen.getByLabelText(/^Thẻ 1\/2\. Mặt trước: Thuật ngữ i1/)).toBeOnTheScreen();

    await fireEvent.press(screen.getByText('Hiện đáp án'));

    expect(screen.queryByText('Hiện đáp án')).toBeNull();
    expect(screen.getByText('Bạn nhớ thẻ này thế nào?')).toBeOnTheScreen();
    expect(screen.getAllByLabelText(/^Đánh giá:/)).toHaveLength(4);
    expect(screen.getByLabelText(/^Thẻ 1\/2\. Mặt sau: Định nghĩa i1/)).toBeOnTheScreen();
  });

  it('dưới mỗi nút có khoảng ôn dự kiến (sm2-preview): thẻ mới → "1 ngày" cả bốn nút', async () => {
    await renderWithProviders(<SrReviewScreen />);
    await fireEvent.press(await screen.findByText('Hiện đáp án'));
    expect(screen.getAllByText('1 ngày')).toHaveLength(4);
    expect(screen.getByLabelText('Đánh giá: Dễ, ôn lại sau 1 ngày')).toBeOnTheScreen();
  });
});

describe('SrReviewScreen — hết thẻ', () => {
  it('hết hàng đợi → SrSessionSummary: đã ôn N, phân bố mức, "Mai ôn", "Ôn tiếp N thẻ" (nạp lại hàng đợi)', async () => {
    await renderWithProviders(<SrReviewScreen />);
    await rateFirstCard('Vừa');
    await rateFirstCard('Dễ');

    expect(await screen.findByText('Hoàn thành phiên ôn')).toBeOnTheScreen();
    expect(await screen.findByText('Bạn đã ôn 2 thẻ. Mai ôn 5 thẻ.')).toBeOnTheScreen();
    expect(screen.getByLabelText('Vừa: 1 thẻ')).toBeOnTheScreen();
    expect(screen.getByLabelText('Dễ: 1 thẻ')).toBeOnTheScreen();
    expect(screen.getByLabelText('Lịch ôn 7 ngày tới')).toBeOnTheScreen();

    await fireEvent.press(screen.getByText('Ôn tiếp 3 thẻ'));
    await waitFor(() => expect(api.due).toHaveBeenCalledTimes(2));
    await fireEvent.press(screen.getByText('Xong'));
    expect(router.back).toHaveBeenCalled();
  });

  it('hôm nay không còn thẻ → "Đã ôn xong" + lịch 7 ngày; "Ngừng ôn bộ này" có xác nhận', async () => {
    api.due.mockResolvedValue({
      items: [],
      remainingToday: 0,
      serverNow: '2026-09-25T02:00:00.000Z',
    });
    api.unenroll.mockResolvedValue(undefined);
    await renderWithProviders(<SrReviewScreen />);

    expect(await screen.findByText('Đã ôn xong')).toBeOnTheScreen();
    expect(await screen.findByLabelText('Lịch ôn 7 ngày tới')).toBeOnTheScreen();
    // Thao tác phá huỷ nằm trong menu ⋯, không phải nút chính của trạng thái "Đã ôn xong".
    expect(screen.queryByText('Ngừng ôn bộ này')).toBeNull();
    await fireEvent.press(screen.getByLabelText('Tuỳ chọn ôn tập'));
    await fireEvent.press(await screen.findByText('Ngừng ôn bộ này'));
    await fireEvent.press(await screen.findByText('Ngừng ôn'));
    await waitFor(() => expect(api.unenroll).toHaveBeenCalledWith('s1'));
  });

  it('không tải được hàng đợi → thông báo + Thử lại', async () => {
    api.due.mockRejectedValue(apiError(500, 'SYS_001'));
    await renderWithProviders(<SrReviewScreen />);
    expect(await screen.findByText('Không mở được phiên ôn')).toBeOnTheScreen();
    expect(screen.getByText('Thử lại')).toBeOnTheScreen();
  });
});
