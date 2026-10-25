import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, renderHook, userEvent, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { showToast } from '@/shared/utils/toast.utils';

import type { BoardTasksData } from '../api/boards.types';
import type { MoveBlockedInfo } from '../api/reviews.types';
import { reviewsService } from '../api/reviews.service';
import { tasksService } from '../api/tasks.service';
import { MoveBlockedSheet } from '../components/review/MoveBlockedSheet';
import { BoardScopeContext } from '../hooks/board-scope.context';
import { REVIEW_REQUIRED_MESSAGE, useMoveTask } from '../hooks/useMoveTask';
import { boardKeys } from '../queries/boards.keys';
import { ids, makeData } from './fixtures';
import { apiError, makeReview, makeRound, makeTaskReviews } from './review-fixtures';

/**
 * p4-05 app.md §8 / PM2-06 (phần tự động của app): kéo thẻ 1/2 duyệt sang Hoàn thành → server `409 TASK_002 REVIEW_REQUIRED` → thẻ VỀ CHỖ
 * CŨ và tấm `MoveBlockedSheet` giải thích "Cần 2 lượt duyệt, đã có 1" + người còn chờ. Client không tự chặn — chỉ đọc lời từ chối.
 */
jest.mock('fractional-indexing', () => jest.requireActual('./mocks/fractional-indexing'));
jest.mock('@/shared/utils/toast.utils', () => ({ showToast: jest.fn() }));
jest.mock('../api/tasks.service', () => ({
  ...jest.requireActual('../api/tasks.service'),
  tasksService: { create: jest.fn(), list: jest.fn(), move: jest.fn() },
}));
jest.mock('../api/reviews.service', () => ({ reviewsService: { getTask: jest.fn() } }));

const move = tasksService.move as jest.MockedFunction<typeof tasksService.move>;
const getTask = reviewsService.getTask as jest.MockedFunction<typeof reviewsService.getTask>;
const KEY = boardKeys.tasks('b1', {});
const METRICS = {
  frame: { height: 812, width: 375, x: 0, y: 0 },
  insets: { bottom: 34, left: 0, right: 0, top: 44 },
};
const DETAILS = {
  approvedCount: 1,
  reason: 'REVIEW_REQUIRED',
  requiredReviews: 2,
  roundStatus: 'OPEN',
};

function seeded(): BoardTasksData {
  const data = makeData();
  data.columns.c_todo = (data.columns.c_todo ?? []).map((task, i) => ({
    ...task,
    position: ['a1', 'a2', 'a3'][i] ?? 'a9',
  }));
  return data;
}

function client() {
  return new QueryClient({
    defaultOptions: {
      mutations: { gcTime: Infinity, retry: false },
      queries: { gcTime: Infinity, retry: false },
    },
  });
}

beforeEach(() => jest.clearAllMocks());

describe('useMoveTask — 409 TASK_002 REVIEW_REQUIRED', () => {
  const T1 = seeded().columns.c_todo?.[0];
  const toDone = {
    afterTaskId: null,
    beforeTaskId: null,
    columnId: 'c_done',
    columnKind: 'DONE' as const,
    task: T1 as never,
  };

  it('hoàn tác thẻ về chỗ cũ và báo ngữ cảnh bảng mở MoveBlockedSheet (không toast lỗi chung)', async () => {
    const queryClient = client();
    queryClient.setQueryData(KEY, seeded());
    const showMoveBlocked = jest.fn();
    const scope = {
      activeBatchId: null,
      boardId: 'b1',
      pendingMutations: new Set<string>(),
      setActiveBatchId: jest.fn(),
      showMoveBlocked,
      wsId: 'w1',
    };
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>
        <BoardScopeContext value={scope}>{children}</BoardScopeContext>
      </QueryClientProvider>
    );
    move.mockRejectedValue(apiError('TASK_002', 409, DETAILS));
    const { result } = await renderHook(() => useMoveTask('b1', scope.pendingMutations), {
      wrapper,
    });

    await act(async () => result.current.move(toDone));

    await waitFor(() =>
      expect(showMoveBlocked).toHaveBeenCalledWith({
        details: DETAILS,
        taskId: 't1',
        taskTitle: 'Thẻ t1',
      }),
    );
    const data = queryClient.getQueryData<BoardTasksData>(KEY) as BoardTasksData;
    expect(ids(data, 'c_todo')).toEqual(['t1', 't2', 't3']);
    expect(ids(data, 'c_done')).toEqual([]);
    expect(showToast).not.toHaveBeenCalled();
  });

  it('không có ngữ cảnh bảng (hook dựng rời) → rơi về toast cảnh báo, thẻ vẫn về chỗ cũ', async () => {
    const queryClient = client();
    queryClient.setQueryData(KEY, seeded());
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    move.mockRejectedValue(apiError('TASK_002', 409, DETAILS));
    const { result } = await renderHook(() => useMoveTask('b1', new Set()), { wrapper });

    await act(async () => result.current.move(toDone));

    await waitFor(() => expect(showToast).toHaveBeenCalledWith('warning', REVIEW_REQUIRED_MESSAGE));
    expect(ids(queryClient.getQueryData<BoardTasksData>(KEY) as BoardTasksData, 'c_todo')).toEqual([
      't1',
      't2',
      't3',
    ]);
  });
});

describe('MoveBlockedSheet', () => {
  async function renderSheet(info: MoveBlockedInfo) {
    const queryClient = client();
    const onClose = jest.fn();
    const onOpenTask = jest.fn();
    const screen = await render(
      <SafeAreaProvider initialMetrics={METRICS}>
        <QueryClientProvider client={queryClient}>
          <MoveBlockedSheet info={info} onClose={onClose} onOpenTask={onOpenTask} />
        </QueryClientProvider>
      </SafeAreaProvider>,
    );
    return { onClose, onOpenTask, screen };
  }

  it('"Cần 2 lượt duyệt, đã có 1" + người còn chờ; mở chấm chéo của thẻ / Đã hiểu', async () => {
    getTask.mockResolvedValue(
      makeTaskReviews({
        currentRound: makeRound({
          approvedCount: 1,
          reviews: [
            makeReview({ id: 'a', status: 'SUBMITTED' }),
            makeReview({ id: 'b', reviewer: { avatarUrl: null, id: 'u2', name: 'Minh' } }),
          ],
        }),
      }),
    );
    const { onClose, onOpenTask, screen } = await renderSheet({
      details: DETAILS as never,
      taskId: 't1',
      taskTitle: 'Báo cáo tuần',
    });
    const user = userEvent.setup();

    expect(screen.getByText('Cần 2 lượt duyệt, đã có 1')).toBeOnTheScreen();
    expect(screen.getByText('Báo cáo tuần')).toBeOnTheScreen();
    expect(screen.getByText('Thẻ đã được đưa về vị trí cũ.')).toBeOnTheScreen();
    expect(await screen.findByText('Minh')).toBeOnTheScreen();
    expect(screen.getByLabelText('Còn chờ 1 người chấm')).toBeOnTheScreen();

    // Nhãn NHÌN THẤY gọn cho nửa hàng nút ("Xem chấm chéo"); câu đọc lên cho trình đọc màn hình vẫn đủ nghĩa.
    expect(screen.getByText('Xem chấm chéo')).toBeOnTheScreen();
    await user.press(screen.getByLabelText('Xem chấm chéo của thẻ'));
    expect(onOpenTask).toHaveBeenCalledWith('t1');
    await user.press(screen.getByText('Đã hiểu'));
    expect(onClose).toHaveBeenCalled();
  });

  it('thẻ chưa từng vào Review (`NONE`) → hướng dẫn kéo vào cột Review, không gọi tải người chấm', async () => {
    const { screen } = await renderSheet({
      details: { ...DETAILS, roundStatus: 'NONE' } as never,
      taskId: 't1',
    });

    expect(screen.getByText('Thẻ cần 2 lượt duyệt trước khi hoàn thành')).toBeOnTheScreen();
    expect(screen.getByText(/Đưa thẻ vào cột Review/)).toBeOnTheScreen();
    expect(getTask).not.toHaveBeenCalled();
  });
});
