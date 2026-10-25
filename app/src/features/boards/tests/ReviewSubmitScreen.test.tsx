import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, userEvent, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { showToast } from '@/shared/utils/toast.utils';

import { reviewsService } from '../api/reviews.service';
import { reviewKeys } from '../queries/reviews.keys';
import { ReviewSubmitScreen } from '../screens/ReviewSubmitScreen';
import { apiError, makeReview, makeRound, makeTaskReviews, RUBRIC_4_3_3 } from './review-fixtures';

/**
 * p4-05 app.md §8 "Jest + RNTL" — màn chấm: Yêu cầu sửa không nhận xét → lỗi tại ô, KHÔNG gọi API; `REVIEW_001` → "Lượt chấm đã đóng";
 * `REVIEW_002` → lỗi tại đúng tiêu chí; nháp còn trong bộ nhớ thì mở lại vẫn thấy; gửi đủ → điểm theo tiêu chí + khoá chống gửi đôi.
 */
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), dismissTo: jest.fn(), push: jest.fn() },
  useLocalSearchParams: () => ({ boardId: 'b1', taskId: 't1', wsId: 'w1' }),
}));
jest.mock('@/shell/capabilities', () => ({ useCapabilities: () => ({ data: undefined }) }));
jest.mock('@/shared/utils/toast.utils', () => ({ showToast: jest.fn() }));
jest.mock('../api/reviews.service', () => ({ reviewsService: { getTask: jest.fn(), submit: jest.fn() } }));
// Nội dung thẻ (chi tiết + mô tả) có test riêng — ở đây chỉ kiểm form chấm.
jest.mock('../components/review/ReviewTaskContext', () => ({ ReviewTaskContext: () => null }));

const getTask = reviewsService.getTask as jest.MockedFunction<typeof reviewsService.getTask>;
const submit = reviewsService.submit as jest.MockedFunction<typeof reviewsService.submit>;
const METRICS = { frame: { height: 812, width: 375, x: 0, y: 0 }, insets: { bottom: 34, left: 0, right: 0, top: 44 } };
const MINE = makeReview({ id: 'rv1', version: 4 });

function assigned(rubric = RUBRIC_4_3_3) {
  return makeTaskReviews({
    currentRound: makeRound({ reviews: [MINE, makeReview({ id: 'rv2' })], rubric }),
    myPermissions: { reassign: false, submit: true, waive: false },
    myReview: MINE,
  });
}

async function renderScreen(seedDraft?: unknown) {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { gcTime: Infinity, retry: false }, queries: { gcTime: Infinity, retry: false } },
  });
  // Không đăng nhập trong test ⇒ `userId` của khoá nháp là chuỗi rỗng.
  if (seedDraft) queryClient.setQueryData(reviewKeys.draft('', 'rv1'), seedDraft);
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <SafeAreaProvider initialMetrics={METRICS}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </SafeAreaProvider>
  );
  const screen = await render(<ReviewSubmitScreen />, { wrapper: Wrapper });
  await screen.findByText('Quyết định');
  return screen;
}

const FULL_DRAFT = {
  decision: 'APPROVED',
  feedback: 'Làm tốt',
  score: { free: null, scores: { r_aaaaaa: 3, r_bbbbbb: 3, r_cccccc: 2 } },
};

beforeEach(() => {
  jest.clearAllMocks();
  getTask.mockResolvedValue(assigned());
});

describe('ReviewSubmitScreen', () => {
  it('Yêu cầu sửa mà không nhận xét → lỗi NGAY tại ô nhận xét, không gọi API', async () => {
    const screen = await renderScreen();
    const user = userEvent.setup();

    await user.press(screen.getByText('Yêu cầu sửa'));
    await user.press(screen.getByText('Gửi kết quả chấm'));

    expect(screen.getByText('Vui lòng ghi nhận xét khi yêu cầu sửa')).toBeOnTheScreen();
    // Tiêu chí chưa chấm cũng báo tại từng ô, không toast chung.
    expect(screen.getAllByText('Chưa chấm ô này')).toHaveLength(3);
    expect(submit).not.toHaveBeenCalled();
  });

  it('nháp còn trong bộ nhớ → mở lại thấy tổng "8,0/10"; gửi đúng điểm từng tiêu chí + version + Idempotency-Key', async () => {
    submit.mockResolvedValue({ review: MINE, round: makeRound(), task: {} as never });
    const screen = await renderScreen(FULL_DRAFT);
    const user = userEvent.setup();

    expect(screen.getByText('8,0/10')).toBeOnTheScreen();
    expect(screen.getByLabelText('Tổng 8 trên 10')).toBeOnTheScreen();
    await user.press(screen.getByText('Gửi kết quả chấm'));

    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    const [reviewId, payload, key] = submit.mock.calls[0] ?? [];
    expect(reviewId).toBe('rv1');
    expect(payload).toEqual({
      expectedVersion: 4,
      feedback: 'Làm tốt',
      rubricScores: [
        { criterionId: 'r_aaaaaa', score: 3 },
        { criterionId: 'r_bbbbbb', score: 3 },
        { criterionId: 'r_cccccc', score: 2 },
      ],
      status: 'APPROVED',
    });
    expect(typeof key).toBe('string');
    await waitFor(() => expect(router.back).toHaveBeenCalled());
    expect(showToast).toHaveBeenCalledWith('success', 'Đã gửi kết quả chấm');
  });

  it('REVIEW_001 (lượt đã đóng giữa chừng) → màn "Lượt chấm đã đóng" + nút về chi tiết thẻ', async () => {
    submit.mockRejectedValue(apiError('REVIEW_001'));
    const screen = await renderScreen(FULL_DRAFT);
    const user = userEvent.setup();

    await user.press(screen.getByText('Gửi kết quả chấm'));

    expect(await screen.findByText('Lượt chấm đã đóng')).toBeOnTheScreen();
    await user.press(screen.getByText('Về chi tiết thẻ'));
    expect(router.dismissTo).toHaveBeenCalledWith(expect.objectContaining({ params: { boardId: 'b1', taskId: 't1', wsId: 'w1' } }));
  });

  it('REVIEW_002 → lỗi tại ĐÚNG tiêu chí server chỉ ra', async () => {
    submit.mockRejectedValue(apiError('REVIEW_002', 400, { criteria: { r_aaaaaa: 'OUT_OF_RANGE' } }));
    const screen = await renderScreen(FULL_DRAFT);
    const user = userEvent.setup();

    await user.press(screen.getByText('Gửi kết quả chấm'));

    expect(await screen.findByText('Điểm từ 0 đến 4')).toBeOnTheScreen();
    expect(screen.getByText('Điểm chấm chưa khớp tiêu chí đánh giá. Kiểm tra lại từng tiêu chí.')).toBeOnTheScreen();
  });

  it('lỗi mạng rồi thử lại CÙNG nội dung → dùng lại đúng Idempotency-Key (không thành hai lượt chấm)', async () => {
    submit.mockRejectedValueOnce(new Error('Network Error')).mockResolvedValueOnce({ review: MINE, round: makeRound(), task: {} as never });
    const screen = await renderScreen(FULL_DRAFT);
    const user = userEvent.setup();

    await user.press(screen.getByText('Gửi kết quả chấm'));
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    await user.press(screen.getByText('Gửi kết quả chấm'));

    await waitFor(() => expect(submit).toHaveBeenCalledTimes(2));
    expect(submit.mock.calls[1]?.[2]).toBe(submit.mock.calls[0]?.[2]);
  });

  it('đã chấm rồi / thẻ không còn → trạng thái nói rõ, không có form', async () => {
    getTask.mockResolvedValueOnce(makeTaskReviews({ myReview: makeReview({ id: 'rv1', status: 'APPROVED' }) }));
    const first = await render(<ReviewSubmitScreen />, { wrapper: freshWrapper() });
    expect(await first.findByText('Bạn đã chấm thẻ này')).toBeOnTheScreen();

    getTask.mockRejectedValueOnce(apiError('RES_001', 404));
    const second = await render(<ReviewSubmitScreen />, { wrapper: freshWrapper() });
    expect(await second.findByText('Thẻ không còn khả dụng')).toBeOnTheScreen();
  });
});

function freshWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <SafeAreaProvider initialMetrics={METRICS}>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </SafeAreaProvider>
    );
  };
}
