import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, userEvent, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { TaskReviewsDto } from '../api/reviews.types';
import { reviewsService } from '../api/reviews.service';
import { ReviewSection } from '../components/task/ReviewSection';
import { makeReview, makeRound, makeTaskReviews } from './review-fixtures';

/**
 * p4-05 app.md §8 "ReviewSection": người xem không được xem kết quả → KHÔNG vẽ điểm dù dữ liệu lỡ mang `score10`; người chấm được giao có
 * "Chấm thẻ này"; OWNER/ADMIN thấy điểm + nhận xét, "Giao lại", "Miễn chấm"; bảng tắt + thẻ chưa từng có lượt → ẩn cả khối.
 */
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('@/shared/utils/toast.utils', () => ({ showToast: jest.fn() }));
jest.mock('../api/reviews.service', () => ({ reviewsService: { getTask: jest.fn(), reassign: jest.fn(), waive: jest.fn() } }));
jest.mock('../queries/task-comments.queries', () => ({ useMentionables: () => ({ data: [] }) }));

const waive = reviewsService.waive as jest.MockedFunction<typeof reviewsService.waive>;
const getTask = reviewsService.getTask as jest.MockedFunction<typeof reviewsService.getTask>;
const METRICS = { frame: { height: 812, width: 375, x: 0, y: 0 }, insets: { bottom: 34, left: 0, right: 0, top: 44 } };

const LAN_APPROVED = makeReview({
  feedback: 'Trình bày rõ ràng',
  id: 'lan',
  reviewer: { avatarUrl: null, id: 'u-lan', name: 'Lan' },
  score10: 8,
  status: 'APPROVED',
  submittedAt: '2026-09-24T05:00:00.000Z',
});
const MINH_PENDING = makeReview({ id: 'minh', reviewer: { avatarUrl: null, id: 'u-minh', name: 'Minh' } });

async function renderSection(initial: TaskReviewsDto, readOnly = false) {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { gcTime: Infinity, retry: false }, queries: { gcTime: Infinity, retry: false } },
  });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <SafeAreaProvider initialMetrics={METRICS}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </SafeAreaProvider>
  );
  return render(
    <ReviewSection assigneeIds={['u-an']} boardId="b1" initial={initial} readOnly={readOnly} taskId="t1" wsId="w1" />,
    { wrapper: Wrapper },
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  // Sau khi ghi (miễn chấm), khối tải lại qua GET — trả bản đã đóng lượt.
  getTask.mockResolvedValue(makeTaskReviews({ currentRound: makeRound({ status: 'WAIVED' }) }));
});

describe('ReviewSection', () => {
  it('MEMBER khác: chỉ trạng thái "1/2" + tên người chấm; KHÔNG điểm/nhận xét dù fixture lỡ mang score10', async () => {
    // BE che quyết định người khác thành SUBMITTED — ở đây cố tình để sót điểm/nhận xét để chắc client không vẽ.
    const masked = { ...LAN_APPROVED, status: 'SUBMITTED' as const };
    const screen = await renderSection(makeTaskReviews({ currentRound: makeRound({ approvedCount: 1, reviews: [masked, MINH_PENDING] }) }));

    expect(screen.getByText('Lượt 1 · Chờ duyệt 1/2')).toBeOnTheScreen();
    expect(screen.getByText('Lan')).toBeOnTheScreen();
    expect(screen.getByText('Đã chấm')).toBeOnTheScreen();
    expect(screen.getByText('Chưa chấm')).toBeOnTheScreen();
    expect(screen.queryByText('8,0/10')).toBeNull();
    expect(screen.queryByText('Trình bày rõ ràng')).toBeNull();
    expect(screen.queryByText('Chấm thẻ này')).toBeNull();
    expect(screen.queryByText('Miễn chấm thẻ này')).toBeNull();
    expect(screen.queryByText('Giao lại')).toBeNull();
  });

  it('người chấm được giao: nút "Chấm thẻ này" mở màn chấm', async () => {
    const screen = await renderSection(
      makeTaskReviews({
        currentRound: makeRound({ reviews: [MINH_PENDING] }),
        myPermissions: { reassign: false, submit: true, waive: false },
        myReview: MINH_PENDING,
      }),
    );
    const user = userEvent.setup();

    await user.press(screen.getByText('Chấm thẻ này'));
    expect(router.push).toHaveBeenCalledWith('/workspaces/w1/boards/b1/tasks/t1/review');
  });

  it('OWNER/ADMIN: thấy điểm + nhận xét, "Giao lại" cạnh người còn chờ; miễn chấm cần lý do ≥ 10 ký tự', async () => {
    waive.mockResolvedValue(makeRound({ status: 'WAIVED' }));
    const screen = await renderSection(
      makeTaskReviews({
        currentRound: makeRound({ approvedCount: 1, reviews: [LAN_APPROVED, MINH_PENDING] }),
        myPermissions: { reassign: true, submit: false, waive: true },
      }),
    );
    const user = userEvent.setup();

    expect(screen.getByText('8,0/10')).toBeOnTheScreen();
    expect(screen.getByLabelText('Điểm 8,0 trên 10')).toBeOnTheScreen();
    expect(screen.getByText('Trình bày rõ ràng')).toBeOnTheScreen();
    expect(screen.getAllByText('Giao lại')).toHaveLength(1);

    await user.press(screen.getByText('Miễn chấm thẻ này'));
    await user.type(screen.getByLabelText('Lý do miễn chấm'), 'Gấp');
    expect(screen.getByRole('button', { name: 'Miễn chấm' })).toBeDisabled();
    await user.type(screen.getByLabelText('Lý do miễn chấm'), ' — thẻ hành chính, không cần chấm');
    await user.press(screen.getByRole('button', { name: 'Miễn chấm' }));
    await waitFor(() => expect(waive).toHaveBeenCalledWith('t1', 'Gấp — thẻ hành chính, không cần chấm'));
  });

  it('chỉ đọc (offline/lưu trữ): không có nút ghi nào', async () => {
    const screen = await renderSection(
      makeTaskReviews({
        currentRound: makeRound({ reviews: [MINH_PENDING] }),
        myPermissions: { reassign: true, submit: true, waive: true },
        myReview: MINH_PENDING,
      }),
      true,
    );

    expect(screen.getByRole('button', { name: 'Chấm thẻ này' })).toBeDisabled();
    expect(screen.queryByText('Miễn chấm thẻ này')).toBeNull();
    expect(screen.queryByText('Giao lại')).toBeNull();
  });

  it('bảng bật nhưng thẻ chưa vào Review → câu hướng dẫn; bảng tắt + chưa từng có lượt → ẩn cả khối', async () => {
    const first = await renderSection(makeTaskReviews({ currentRound: null }));
    expect(first.getByText(/Thẻ chưa vào cột Review/)).toBeOnTheScreen();

    const second = await renderSection(makeTaskReviews({ currentRound: null, enabled: false }));
    expect(second.queryByText('Chấm chéo')).toBeNull();
  });

  it('lượt tự duyệt / lịch sử lượt cũ nói rõ vì sao không có điểm', async () => {
    const screen = await renderSection(
      makeTaskReviews({
        currentRound: makeRound({ autoApproved: true, closeReason: 'APPROVED', round: 2, status: 'APPROVED' }),
        history: [makeRound({ closeReason: 'CHANGES_REQUESTED', id: 'old', status: 'CHANGES_REQUESTED' })],
      }),
    );

    expect(screen.getByText('Lượt 2 · Tự duyệt do nhóm không đủ người chấm')).toBeOnTheScreen();
    expect(screen.getByText(/lượt này không có điểm/)).toBeOnTheScreen();
    // Lượt cũ gập sẵn, mở ra thấy lý do đóng.
    await userEvent.setup().press(screen.getByText('Lịch sử chấm (1 lượt)'));
    expect(screen.getByText('Lượt 1 · Cần sửa')).toBeOnTheScreen();
  });
});
