import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';
import { io } from 'socket.io-client';
import type { ReactNode } from 'react';

import { SocketEvent } from '@/core/socket';

import type { BoardTasksData } from '../api/boards.types';
import { useReviewInboxRealtime, useReviewRealtime } from '../hooks/useReviewRealtime';
import { boardKeys } from '../queries/boards.keys';
import { reviewKeys } from '../queries/reviews.keys';
import { applyTaskEvent } from '../utils/apply-task-event';
import { makeData, makeTask } from './fixtures';
import { makeReview, makeTaskReviews } from './review-fixtures';

/**
 * p4-05 app.md §8 "Jest": `task:review-updated` vá chip trên thẻ + invalidate ĐÚNG khoá, KHÔNG ghi điểm vào cache (sự kiện chỉ mang
 * số đếm); thông báo `review.*` làm mới "Cần chấm của tôi"; `task:updated` không mang tiến độ thì chip giữ số đếm cũ.
 */
interface MockSocket {
  __emitServer: (event: string, payload?: unknown) => void;
}
const mockSocket = (io as jest.MockedFunction<typeof io>).mock.results[0]?.value as MockSocket;
const TASKS_KEY = boardKeys.tasks('b1', {});
/** Khối chấm chéo đang mở của t1 — người xem ĐÃ thấy điểm của mình; socket không được đụng vào nó. */
const CACHED = makeTaskReviews({ myReview: makeReview({ id: 'mine', score10: 9, status: 'APPROVED' }) });

function setup() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retry: false } } });
  queryClient.setQueryData(TASKS_KEY, makeData());
  queryClient.setQueryData(reviewKeys.task('t1'), CACHED);
  const spy = jest.spyOn(queryClient, 'invalidateQueries');
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, spy, wrapper };
}

const keysOf = (spy: jest.SpyInstance) => spy.mock.calls.map(([filters]) => JSON.stringify((filters as { queryKey: unknown }).queryKey));
const card = (queryClient: QueryClient, id: string) =>
  (queryClient.getQueryData<BoardTasksData>(TASKS_KEY)?.columns.c_todo ?? []).find((task) => task.id === id);
const updated = (overrides: Record<string, unknown> = {}) => ({
  approvedCount: 1,
  assignedCount: 2,
  boardId: 'b1',
  requiredReviews: 2,
  reviewerIds: ['u1', 'u2'],
  round: 1,
  roundId: 'round-1',
  status: 'OPEN',
  taskId: 't1',
  ...overrides,
});

async function emit(event: string, payload: unknown): Promise<void> {
  await act(async () => mockSocket.__emitServer(event, payload));
}

describe('useReviewRealtime — task:review-updated', () => {
  it('vá chip "Chờ duyệt 1/2", invalidate khối chấm chéo của thẻ + "Cần chấm", KHÔNG ghi điểm vào cache', async () => {
    const { queryClient, spy, wrapper } = setup();
    await renderHook(() => useReviewRealtime('b1'), { wrapper });

    await emit(SocketEvent.TASK_REVIEW_UPDATED, updated());

    expect(card(queryClient, 't1')).toMatchObject({ review: { approvedCount: 1, requiredReviews: 2 }, reviewState: 'PENDING' });
    const keys = keysOf(spy);
    expect(keys).toContain(JSON.stringify(reviewKeys.task('t1')));
    expect(keys).toContain(JSON.stringify(reviewKeys.mineAll));
    expect(keys).not.toContain(JSON.stringify(reviewKeys.task('t2')));
    // Cache khối chấm chéo giữ NGUYÊN (chỉ đánh dấu cũ để tải lại qua GET đã lọc theo người xem).
    expect(queryClient.getQueryData(reviewKeys.task('t1'))).toBe(CACHED);
  });

  it('lượt đóng vì Yêu cầu sửa → chip "Cần sửa", bỏ số đếm', async () => {
    const { queryClient, wrapper } = setup();
    await renderHook(() => useReviewRealtime('b1'), { wrapper });

    await emit(SocketEvent.TASK_REVIEW_UPDATED, updated({ status: 'CHANGES_REQUESTED' }));

    const t1 = card(queryClient, 't1');
    expect(t1?.reviewState).toBe('CHANGES_REQUESTED');
    expect(t1?.review).toBeUndefined();
  });

  it('sự kiện của bảng KHÁC → bỏ qua', async () => {
    const { queryClient, spy, wrapper } = setup();
    await renderHook(() => useReviewRealtime('b1'), { wrapper });

    await emit(SocketEvent.TASK_REVIEW_UPDATED, updated({ boardId: 'b2' }));

    expect(card(queryClient, 't1')?.reviewState).toBe('NONE');
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('useReviewInboxRealtime — notification:created', () => {
  it('chỉ loại review.* mới làm mới "Cần chấm của tôi"', async () => {
    const { spy, wrapper } = setup();
    await renderHook(() => useReviewInboxRealtime(), { wrapper });

    await emit(SocketEvent.NOTIFICATION_CREATED, { id: 'n1', type: 'message.new' });
    expect(spy).not.toHaveBeenCalled();

    await emit(SocketEvent.NOTIFICATION_CREATED, { id: 'n2', type: 'review.requested' });
    expect(keysOf(spy)).toEqual([JSON.stringify(reviewKeys.mineAll)]);
  });
});

describe('apply-task-event — giữ tiến độ chấm chéo', () => {
  it('task:updated không mang `review` (bản dựng khác) mà thẻ vẫn PENDING → giữ "1/2"; rời PENDING → bỏ', () => {
    const data = makeData();
    data.columns.c_todo = [makeTask({ id: 't1', review: { approvedCount: 1, requiredReviews: 2 }, reviewState: 'PENDING' })];
    const ctx = { currentUserId: 'me', filter: {} };

    const kept = applyTaskEvent(data, { task: makeTask({ id: 't1', reviewState: 'PENDING', title: 'Đổi tên', version: 2 }), type: 'updated' }, ctx);
    expect(kept.data.columns.c_todo?.[0]).toMatchObject({ review: { approvedCount: 1, requiredReviews: 2 }, title: 'Đổi tên' });

    const done = applyTaskEvent(data, { task: makeTask({ id: 't1', reviewState: 'APPROVED', version: 3 }), type: 'updated' }, ctx);
    expect(done.data.columns.c_todo?.[0]?.review).toBeUndefined();
  });
});
