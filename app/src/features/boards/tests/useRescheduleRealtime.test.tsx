import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';
import { io } from 'socket.io-client';
import type { ReactNode } from 'react';

import { SocketEvent } from '@/core/socket';

import { useRescheduleRealtime } from '../hooks/useRescheduleRealtime';
import { boardKeys } from '../queries/boards.keys';
import { taskKeys } from '../queries/task-detail.keys';
import { makeDetail } from './detail-fixtures';
import { makeData, makeTask } from './fixtures';

interface MockSocket {
  __emitServer: (event: string, payload?: unknown) => void;
}
const mockSocket = (io as jest.MockedFunction<typeof io>).mock.results[0]?.value as MockSocket;

function setup() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retry: false } } });
  queryClient.setQueryData(boardKeys.tasks('b1', {}), makeData());
  queryClient.setQueryData(taskKeys.detail('t1'), makeDetail({ id: 't1' }));
  queryClient.setQueryData(taskKeys.dependencies('t1'), { predecessors: [], successors: [] });
  queryClient.setQueryData(taskKeys.dependencies('t2'), { predecessors: [], successors: [] });
  const spy = jest.spyOn(queryClient, 'invalidateQueries');
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { spy, wrapper };
}

async function emit(event: string, payload: unknown): Promise<void> {
  await act(async () => mockSocket.__emitServer(event, payload));
}

const keysOf = (spy: jest.SpyInstance) =>
  spy.mock.calls.map(([filters]) => JSON.stringify((filters as { queryKey: unknown }).queryKey));

describe('useRescheduleRealtime', () => {
  it('board:rescheduled: tải lại thẻ của bảng, Gantt, và CHI TIẾT của thẻ trong taskIds đang có trong cache', async () => {
    const { spy, wrapper } = setup();
    await renderHook(() => useRescheduleRealtime('b1'), { wrapper });

    await emit(SocketEvent.BOARD_RESCHEDULED, { batchId: 'batch-1', boardId: 'b1', count: 2, final: false, taskIds: ['t1', 'không-có-trong-cache'] });

    const keys = keysOf(spy);
    expect(keys).toContain(JSON.stringify(boardKeys.tasksAll('b1')));
    expect(keys).toContain(JSON.stringify(boardKeys.ganttAll('b1')));
    expect(keys).toContain(JSON.stringify(taskKeys.detail('t1')));
    // Thẻ chưa từng mở thì không tải chi tiết.
    expect(keys).not.toContain(JSON.stringify(taskKeys.detail('không-có-trong-cache')));
    // Chưa `final` ⇒ chưa tải lại trạng thái lô.
    expect(keys).not.toContain(JSON.stringify(boardKeys.rescheduleBatch('batch-1')));
  });

  it('board:rescheduled { final } tải lại trạng thái lô để banner chuyển sang kết quả', async () => {
    const { spy, wrapper } = setup();
    await renderHook(() => useRescheduleRealtime('b1'), { wrapper });

    await emit(SocketEvent.BOARD_RESCHEDULED, { batchId: 'batch-1', boardId: 'b1', count: 50, final: true, taskIds: [] });

    expect(keysOf(spy)).toContain(JSON.stringify(boardKeys.rescheduleBatch('batch-1')));
  });

  it('sự kiện của bảng KHÁC bị bỏ', async () => {
    const { spy, wrapper } = setup();
    await renderHook(() => useRescheduleRealtime('b1'), { wrapper });

    await emit(SocketEvent.BOARD_RESCHEDULED, { batchId: 'x', boardId: 'b-khac', count: 1, final: true, taskIds: ['t1'] });

    expect(spy).not.toHaveBeenCalled();
  });

  it('task:updated { changed: [dependencies] } chỉ tải lại phụ thuộc CỦA THẺ ĐÓ (+ Gantt), không đụng thẻ khác', async () => {
    const { spy, wrapper } = setup();
    await renderHook(() => useRescheduleRealtime('b1'), { wrapper });

    await emit(SocketEvent.TASK_UPDATED, { actorId: 'x', changed: ['dependencies'], task: makeTask({ id: 't1', version: 4 }) });

    const keys = keysOf(spy);
    expect(keys).toContain(JSON.stringify(taskKeys.dependencies('t1')));
    expect(keys).not.toContain(JSON.stringify(taskKeys.dependencies('t2')));
    expect(keys).toContain(JSON.stringify(boardKeys.ganttAll('b1')));
  });

  it('task:updated { changed: [dates] } chỉ làm Gantt đổi chỗ thanh; không có `changed` hoặc thẻ bảng khác thì bỏ', async () => {
    const { spy, wrapper } = setup();
    await renderHook(() => useRescheduleRealtime('b1'), { wrapper });

    await emit(SocketEvent.TASK_UPDATED, { actorId: 'x', changed: ['dates'], task: makeTask({ id: 't1', version: 4 }) });
    expect(keysOf(spy)).toEqual([JSON.stringify(boardKeys.ganttAll('b1'))]);

    spy.mockClear();
    await emit(SocketEvent.TASK_UPDATED, { actorId: 'x', task: makeTask({ id: 't1', version: 5 }) });
    await emit(SocketEvent.TASK_UPDATED, { actorId: 'x', changed: ['dependencies'], task: makeTask({ boardId: 'b-khac', id: 't1', version: 6 }) });
    expect(spy).not.toHaveBeenCalled();
  });
});
