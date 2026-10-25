import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, userEvent, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import type { ReactNode } from 'react';

import { ActivityWidgetsSlot } from '@/shared/activity-widgets';
import { useFeature } from '@/shell/capabilities';

import { reviewsService } from '../api/reviews.service';
import type { MyReviewItemDto } from '../api/reviews.types';
import { MyReviewsActivityWidget } from '../components/review/MyReviewsActivityWidget';
// Tác dụng phụ: đăng ký widget vào khe (giống `app/(app)/activity/_layout.tsx`) — ca cuối kiểm khe vẽ đúng.
import '../register-activity-widgets';

/**
 * p4-05 app.md §1: tab Hoạt động hiện thẻ "N thẻ cần chấm" (dữ liệu `useMyReviews('PENDING')`). Chỉ hiện khi cờ `project` bật và CÓ thẻ chờ;
 * đủ một trang còn trang sau → "20+". Đăng ký qua khe `@/shared/activity-widgets` để `features/activity` không import `boards`.
 */
jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  useIsFocused: jest.fn(() => true),
}));
jest.mock('@/shell/capabilities', () => ({ useFeature: jest.fn() }));
jest.mock('@/core/socket', () => ({
  ...jest.requireActual('@/core/socket/socket.events'),
  onRoomResync: jest.fn(() => jest.fn()),
  useSocketEvent: jest.fn(),
}));
jest.mock('../api/reviews.service', () => ({
  MY_REVIEWS_PAGE_SIZE: 20,
  reviewsService: { mine: jest.fn() },
}));

const mine = reviewsService.mine as jest.MockedFunction<typeof reviewsService.mine>;

function item(id: string): MyReviewItemDto {
  return {
    assignedAt: '2026-09-25T01:00:00.000Z',
    reviewId: `rv-${id}`,
    round: { approvedCount: 1, requiredReviews: 2, round: 1 },
    status: 'PENDING',
    submittedAt: null,
    task: {
      boardId: 'b1',
      boardName: 'Sprint 3',
      columnKind: 'REVIEW',
      id,
      title: `Thẻ ${id}`,
      workspaceId: 'w1',
      workspaceName: 'Nhóm A',
    },
  };
}

function wrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { gcTime: Infinity, retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  (useFeature as jest.Mock).mockReturnValue(true);
});

describe('MyReviewsActivityWidget', () => {
  it('có thẻ chờ chấm → "N thẻ cần chấm"; "Chấm ngay" mở "Cần chấm của tôi"', async () => {
    mine.mockResolvedValue({ items: [item('t1'), item('t2'), item('t3')], nextCursor: null });
    const screen = await render(<MyReviewsActivityWidget />, { wrapper: wrapper() });

    expect(await screen.findByText('3 thẻ cần chấm')).toBeOnTheScreen();
    expect(mine).toHaveBeenCalledWith('PENDING', undefined);
    await userEvent.setup().press(screen.getByRole('button', { name: 'Chấm ngay' }));
    expect(router.push).toHaveBeenCalledWith('/me/reviews');
  });

  it('đủ một trang còn trang sau → "20+ thẻ cần chấm" (không tải hết chỉ để đếm)', async () => {
    mine.mockResolvedValue({
      items: Array.from({ length: 20 }, (_, i) => item(`t${i}`)),
      nextCursor: 'c2',
    });
    const screen = await render(<MyReviewsActivityWidget />, { wrapper: wrapper() });

    expect(await screen.findByText('20+ thẻ cần chấm')).toBeOnTheScreen();
  });

  it('không có thẻ chờ → không vẽ gì (không chừa thẻ rỗng)', async () => {
    mine.mockResolvedValue({ items: [], nextCursor: null });
    const screen = await render(<MyReviewsActivityWidget />, { wrapper: wrapper() });

    await waitFor(() => expect(mine).toHaveBeenCalled());
    expect(screen.toJSON()).toBeNull();
  });

  it('cờ `project` tắt → không vẽ, KHÔNG gọi API', async () => {
    (useFeature as jest.Mock).mockReturnValue(false);
    const screen = await render(<MyReviewsActivityWidget />, { wrapper: wrapper() });

    expect(screen.toJSON()).toBeNull();
    await waitFor(() => expect(mine).not.toHaveBeenCalled());
  });

  it('lỗi tải → không vẽ gì (widget không làm bẩn tab Hoạt động)', async () => {
    mine.mockRejectedValue(new Error('mạng'));
    const screen = await render(<MyReviewsActivityWidget />, { wrapper: wrapper() });

    await waitFor(() => expect(mine).toHaveBeenCalled());
    expect(screen.toJSON()).toBeNull();
  });

  it('đăng ký ở `register-activity-widgets` → hiện qua khe của tab Hoạt động', async () => {
    mine.mockResolvedValue({ items: [item('t1')], nextCursor: null });
    const screen = await render(<ActivityWidgetsSlot />, { wrapper: wrapper() });

    expect(await screen.findByText('1 thẻ cần chấm')).toBeOnTheScreen();
  });
});
