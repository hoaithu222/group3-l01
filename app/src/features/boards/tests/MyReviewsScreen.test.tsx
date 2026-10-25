import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, userEvent, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useFeature } from '@/shell/capabilities';

import type { MyReviewItemDto } from '../api/reviews.types';
import { reviewsService } from '../api/reviews.service';
import { ReviewChip } from '../components/kanban/ReviewChip';
import { MyReviewsMeRow } from '../components/review/MyReviewsMeRow';
import { MyReviewsScreen } from '../screens/MyReviewsScreen';

/**
 * p4-05 app.md §1/§3 "MyReviews": hai tab Cần chấm · Đã chấm; chạm hàng cần chấm → màn chấm, đã chấm → chi tiết thẻ; rỗng nói rõ. Hàng "Cần
 * chấm" ở màn Tôi có số đếm (đủ một trang → "20+"), ẩn khi cờ `project` tắt. Chip trên thẻ: chữ + icon, đọc được bằng trình đọc màn hình.
 */
jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn() } }));
jest.mock('@/shell/capabilities', () => ({ useFeature: jest.fn() }));
jest.mock('../api/reviews.service', () => ({ MY_REVIEWS_PAGE_SIZE: 20, reviewsService: { mine: jest.fn() } }));

const mine = reviewsService.mine as jest.MockedFunction<typeof reviewsService.mine>;
const METRICS = { frame: { height: 812, width: 375, x: 0, y: 0 }, insets: { bottom: 34, left: 0, right: 0, top: 44 } };

function item(id: string, overrides: Partial<MyReviewItemDto> = {}): MyReviewItemDto {
  return {
    assignedAt: '2026-09-25T01:00:00.000Z',
    reviewId: `rv-${id}`,
    round: { approvedCount: 1, requiredReviews: 2, round: 1 },
    status: 'PENDING',
    submittedAt: null,
    task: { boardId: 'b1', boardName: 'Sprint 3', columnKind: 'REVIEW', id, title: `Thẻ ${id}`, workspaceId: 'w1', workspaceName: 'Nhóm A' },
    ...overrides,
  };
}

function wrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <SafeAreaProvider initialMetrics={METRICS}>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </SafeAreaProvider>
    );
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  (useFeature as jest.Mock).mockReturnValue(true);
});

describe('MyReviewsScreen', () => {
  it('Cần chấm: hàng có nhóm · bảng + tiến độ "Lượt 1 · 1/2"; chạm → màn chấm', async () => {
    mine.mockResolvedValue({ items: [item('t1')], nextCursor: null });
    const screen = await render(<MyReviewsScreen />, { wrapper: wrapper() });
    const user = userEvent.setup();

    expect(await screen.findByText('Thẻ t1')).toBeOnTheScreen();
    expect(screen.getByText('Nhóm A · Sprint 3')).toBeOnTheScreen();
    expect(screen.getByText('Lượt 1 · 1/2')).toBeOnTheScreen();
    expect(mine).toHaveBeenCalledWith('PENDING', undefined);

    await user.press(screen.getByText('Thẻ t1'));
    expect(router.push).toHaveBeenCalledWith('/workspaces/w1/boards/b1/tasks/t1/review');
  });

  it('Đã chấm: tải theo tab, hàng ghi quyết định của mình; chạm → chi tiết thẻ', async () => {
    mine.mockImplementation(async (status) =>
      status === 'PENDING'
        ? { items: [], nextCursor: null }
        : { items: [item('t9', { status: 'REQUEST_CHANGES', submittedAt: '2026-09-25T02:00:00.000Z' })], nextCursor: null },
    );
    const screen = await render(<MyReviewsScreen />, { wrapper: wrapper() });
    const user = userEvent.setup();

    expect(await screen.findByText('Không có thẻ cần chấm')).toBeOnTheScreen();
    await user.press(screen.getByText('Đã chấm'));
    expect(await screen.findByText('Bạn yêu cầu sửa')).toBeOnTheScreen();

    await user.press(screen.getByText('Thẻ t9'));
    expect(router.push).toHaveBeenCalledWith({
      params: { boardId: 'b1', taskId: 't9', wsId: 'w1' },
      pathname: '/workspaces/[wsId]/boards/[boardId]/tasks/[taskId]',
    });
  });
});

describe('MyReviewsMeRow (màn Tôi)', () => {
  it('đủ một trang còn trang sau → "20+"; chạm mở "Cần chấm của tôi"', async () => {
    mine.mockResolvedValue({ items: Array.from({ length: 20 }, (_, i) => item(`t${i}`)), nextCursor: 'c2' });
    const screen = await render(<MyReviewsMeRow />, { wrapper: wrapper() });
    const user = userEvent.setup();

    expect(await screen.findByLabelText('20+ thẻ đang chờ bạn chấm')).toBeOnTheScreen();
    await user.press(screen.getByText('Cần chấm'));
    expect(router.push).toHaveBeenCalledWith('/me/reviews');
  });

  it('cờ `project` tắt → không vẽ, không gọi API', async () => {
    (useFeature as jest.Mock).mockReturnValue(false);
    const screen = await render(<MyReviewsMeRow />, { wrapper: wrapper() });

    expect(screen.queryByText('Cần chấm')).toBeNull();
    await waitFor(() => expect(mine).not.toHaveBeenCalled());
  });
});

describe('ReviewChip (thẻ Kanban)', () => {
  it('Chờ duyệt 1/2 · Cần sửa · Đã duyệt — chữ + nhãn đọc; NONE không vẽ', async () => {
    const pending = await render(<ReviewChip task={{ review: { approvedCount: 1, requiredReviews: 2 }, reviewState: 'PENDING' }} />);
    expect(pending.getByText('Chờ duyệt 1/2')).toBeOnTheScreen();
    expect(pending.getByLabelText('Chờ duyệt: đã có 1 trên 2 lượt duyệt')).toBeOnTheScreen();

    const changes = await render(<ReviewChip task={{ reviewState: 'CHANGES_REQUESTED' }} />);
    expect(changes.getByText('Cần sửa')).toBeOnTheScreen();

    const approved = await render(<ReviewChip task={{ reviewState: 'APPROVED' }} />);
    expect(approved.getByLabelText('Thẻ đã đủ lượt duyệt')).toBeOnTheScreen();

    const none = await render(<ReviewChip task={{ reviewState: 'NONE' }} />);
    expect(none.toJSON()).toBeNull();
  });
});
