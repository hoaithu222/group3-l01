import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';
import { io } from 'socket.io-client';
import type { ReactNode } from 'react';

import { SocketEvent } from '@/core/socket';

import type { BoardDetail, BoardTasksData } from '../api/boards.types';
import { useBoardRealtime } from '../hooks/useBoardRealtime';
import { boardKeys } from '../queries/boards.keys';
import { ids, makeData, makeTask } from './fixtures';

interface MockSocket {
  __emitServer: (event: string, payload?: unknown) => void;
}
const mockSocket = (io as jest.MockedFunction<typeof io>).mock.results[0]?.value as MockSocket;

const KEY = boardKeys.tasks('b1', {});

function setup(pending: Set<string> = new Set()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retry: false } } });
  queryClient.setQueryData(KEY, makeData());
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { pending, queryClient, wrapper };
}

const cache = (queryClient: QueryClient) => queryClient.getQueryData<BoardTasksData>(KEY) as BoardTasksData;

async function emit(event: string, payload: unknown): Promise<void> {
  await act(async () => mockSocket.__emitServer(event, payload));
}

describe('useBoardRealtime — map sự kiện vào cache', () => {
  it('task:moved của người khác: thẻ trượt sang cột mới', async () => {
    const { pending, queryClient, wrapper } = setup();
    await renderHook(() => useBoardRealtime('b1', pending), { wrapper });

    await emit(SocketEvent.TASK_MOVED, {
      actorId: 'other',
      clientMutationId: 'mv-của-người-khác',
      columnId: 'c_done',
      columnKind: 'DONE',
      completedAt: '2026-09-19T00:00:00.000Z',
      id: 't1',
      position: 'a0',
      version: 2,
    });

    expect(ids(cache(queryClient), 'c_done')).toEqual(['t1']);
    expect(ids(cache(queryClient), 'c_todo')).toEqual(['t2', 't3']);
  });

  it('task:moved mang clientMutationId của CHÍNH MÌNH đang bay ⇒ bỏ (không ghi đè optimistic)', async () => {
    const { pending, queryClient, wrapper } = setup(new Set(['mv-của-tôi']));
    await renderHook(() => useBoardRealtime('b1', pending), { wrapper });

    await emit(SocketEvent.TASK_MOVED, {
      actorId: 'me',
      clientMutationId: 'mv-của-tôi',
      columnId: 'c_done',
      columnKind: 'DONE',
      completedAt: null,
      id: 't1',
      position: 'a0',
      version: 2,
    });

    expect(ids(cache(queryClient), 'c_todo')).toEqual(['t1', 't2', 't3']);
  });

  it('task:moved của bảng KHÁC (mở chồng hai bảng, socket nghe cả hai phòng) ⇒ bỏ qua, không tải lại bảng này', async () => {
    const { pending, queryClient, wrapper } = setup();
    const spy = jest.spyOn(queryClient, 'invalidateQueries');
    await renderHook(() => useBoardRealtime('b1', pending), { wrapper });

    await emit(SocketEvent.TASK_MOVED, {
      actorId: 'other',
      boardId: 'b-khac',
      clientMutationId: 'mv-bảng-khác',
      columnId: 'c_x',
      columnKind: 'DONE',
      completedAt: null,
      id: 'x1',
      position: 'a0',
      version: 2,
    });

    expect(spy).not.toHaveBeenCalled();
    expect(ids(cache(queryClient), 'c_todo')).toEqual(['t1', 't2', 't3']);
  });

  it('task:created / task:updated / task:deleted', async () => {
    const { pending, queryClient, wrapper } = setup();
    await renderHook(() => useBoardRealtime('b1', pending), { wrapper });

    await emit(SocketEvent.TASK_CREATED, { actorId: 'x', task: makeTask({ id: 'n1', position: 'a5' }) });
    expect(ids(cache(queryClient), 'c_todo')).toContain('n1');

    await emit(SocketEvent.TASK_UPDATED, { actorId: 'x', task: makeTask({ id: 'n1', position: 'a5', title: 'Đổi tên', version: 2 }) });
    expect(cache(queryClient).columns.c_todo?.find((task) => task.id === 'n1')?.title).toBe('Đổi tên');

    await emit(SocketEvent.TASK_DELETED, { actorId: 'x', id: 'n1' });
    expect(ids(cache(queryClient), 'c_todo')).not.toContain('n1');
  });

  it('sự kiện của bảng KHÁC không đụng vào cache', async () => {
    const { pending, queryClient, wrapper } = setup();
    await renderHook(() => useBoardRealtime('b1', pending), { wrapper });

    await emit(SocketEvent.TASK_CREATED, { actorId: 'x', task: makeTask({ boardId: 'b-khac', id: 'n1', position: 'a5' }) });
    expect(ids(cache(queryClient), 'c_todo')).not.toContain('n1');
  });

  it('board:updated mới hơn ⇒ tải lại detail; rebalancedColumnId ⇒ tải lại thẻ', async () => {
    const { pending, queryClient, wrapper } = setup();
    queryClient.setQueryData<Partial<BoardDetail>>(boardKeys.detail('b1'), { id: 'b1', version: 1 });
    const spy = jest.spyOn(queryClient, 'invalidateQueries');
    await renderHook(() => useBoardRealtime('b1', pending), { wrapper });

    await emit(SocketEvent.BOARD_UPDATED, { boardId: 'b1', rebalancedColumnId: 'c_todo', version: 2 });

    expect(spy).toHaveBeenCalledWith({ queryKey: boardKeys.detail('b1') });
    expect(spy).toHaveBeenCalledWith({ queryKey: boardKeys.tasksAll('b1') });
  });

  it('board:updated cũ (version <= cache) và không rebalance ⇒ không tải lại', async () => {
    const { pending, queryClient, wrapper } = setup();
    queryClient.setQueryData<Partial<BoardDetail>>(boardKeys.detail('b1'), { id: 'b1', version: 5 });
    const spy = jest.spyOn(queryClient, 'invalidateQueries');
    await renderHook(() => useBoardRealtime('b1', pending), { wrapper });

    await emit(SocketEvent.BOARD_UPDATED, { boardId: 'b1', version: 5 });

    expect(spy).not.toHaveBeenCalled();
  });

  it('board:updated labelsChanged (version KHÔNG đổi) ⇒ vẫn tải lại detail (nhãn) và thẻ (labelIds)', async () => {
    const { pending, queryClient, wrapper } = setup();
    queryClient.setQueryData<Partial<BoardDetail>>(boardKeys.detail('b1'), { id: 'b1', version: 5 });
    const spy = jest.spyOn(queryClient, 'invalidateQueries');
    await renderHook(() => useBoardRealtime('b1', pending), { wrapper });

    await emit(SocketEvent.BOARD_UPDATED, { boardId: 'b1', labelsChanged: true, version: 5 });

    expect(spy).toHaveBeenCalledWith({ queryKey: boardKeys.detail('b1') });
    expect(spy).toHaveBeenCalledWith({ queryKey: boardKeys.tasksAll('b1') });
  });
});
