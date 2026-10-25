import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { waitFor } from '@testing-library/react-native';

import type { BoardTasksData } from '../api/boards.types';
import { refetchEmptyBoardCaches, revertCardInBoardCaches, snapshotBoardCaches } from '../hooks/board-cache';
import { boardKeys } from '../queries/boards.keys';
import { findTask, insertTask, removeTask } from '../utils/board-tasks-data';
import { ids, makeData } from './fixtures';

const KEY = boardKeys.tasks('b1', {});

function client(): QueryClient {
  // `gcTime: Infinity`: không có bộ hẹn giờ dọn cache giữ tiến trình Jest sống sau khi test xong.
  return new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retry: false } } });
}

function patchCard(queryClient: QueryClient, taskId: string, patch: Partial<NonNullable<ReturnType<typeof findTask>>>) {
  queryClient.setQueryData<BoardTasksData>(KEY, (data) => {
    const card = data && findTask(data, taskId);
    return data && card ? insertTask(data, { ...card, ...patch }) : data;
  });
}

const data = (queryClient: QueryClient) => queryClient.getQueryData<BoardTasksData>(KEY) as BoardTasksData;

describe('revertCardInBoardCaches — hoàn tác optimistic của MỘT thẻ', () => {
  it('chỉ trả thẻ đó về bản chụp; thẻ KHÁC đổi sau lúc chụp (lượt kéo khác đã xong) giữ nguyên', () => {
    const queryClient = client();
    queryClient.setQueryData(KEY, makeData());
    const snapshots = snapshotBoardCaches(queryClient, 'b1');
    patchCard(queryClient, 't1', { columnId: 'c_done', columnKind: 'DONE' }); // optimistic của lượt sắp hỏng
    patchCard(queryClient, 't2', { columnId: 'c_doing', columnKind: 'IN_PROGRESS', version: 2 }); // lượt khác, server đã ghi

    revertCardInBoardCaches(queryClient, snapshots, 't1');

    expect(ids(data(queryClient), 'c_todo')).toEqual(['t1', 't3']);
    expect(ids(data(queryClient), 'c_doing')).toEqual(['d1', 't2']);
    expect(ids(data(queryClient), 'c_done')).toEqual([]);
  });

  it('thẻ đã có version MỚI HƠN bản chụp (bản server về qua realtime) ⇒ giữ, không lùi về bản cũ', () => {
    const queryClient = client();
    queryClient.setQueryData(KEY, makeData());
    const snapshots = snapshotBoardCaches(queryClient, 'b1');
    patchCard(queryClient, 't1', { columnId: 'c_done', columnKind: 'DONE', version: 5 });

    revertCardInBoardCaches(queryClient, snapshots, 't1');

    expect(findTask(data(queryClient), 't1')).toMatchObject({ columnId: 'c_done', version: 5 });
  });

  it('thẻ đã biến mất khỏi cache (bị xoá ở máy khác) ⇒ không hồi sinh', () => {
    const queryClient = client();
    queryClient.setQueryData(KEY, makeData());
    const snapshots = snapshotBoardCaches(queryClient, 'b1');
    queryClient.setQueryData<BoardTasksData>(KEY, (current) => current && removeTask(current, 't1'));

    revertCardInBoardCaches(queryClient, snapshots, 't1');

    expect(findTask(data(queryClient), 't1')).toBeUndefined();
  });
});

describe('refetchEmptyBoardCaches — bộ lọc mới bị huỷ lượt tải đầu không được kẹt', () => {
  it('query ĐANG xem, chưa có dữ liệu, không tải (lượt đầu vừa bị `cancelQueries` huỷ) ⇒ tải lại; cache đã có dữ liệu ⇒ không gọi mạng', async () => {
    const queryClient = client();
    queryClient.setQueryData(KEY, makeData());
    const fullFn = jest.fn(async () => makeData());
    const unsubscribeFull = new QueryObserver(queryClient, { queryFn: fullFn, queryKey: KEY, staleTime: Infinity }).subscribe(() => undefined);

    const mineKey = boardKeys.tasks('b1', { assigneeId: 'me' });
    const mineFn = jest.fn(() => new Promise<BoardTasksData>((resolve) => setTimeout(() => resolve(makeData()), 0)));
    const unsubscribeMine = new QueryObserver(queryClient, { queryFn: mineFn, queryKey: mineKey }).subscribe(() => undefined);
    // Như `onMutate` của kéo/tạo thẻ: huỷ mọi lượt tải của bảng ⇒ query lọc mới lùi về "chưa có dữ liệu, không tải".
    await queryClient.cancelQueries({ queryKey: boardKeys.tasksAll('b1') });
    expect(queryClient.getQueryState(mineKey)).toMatchObject({ data: undefined, fetchStatus: 'idle' });

    refetchEmptyBoardCaches(queryClient, 'b1');

    await waitFor(() => expect(queryClient.getQueryData(mineKey)).toBeDefined());
    expect(mineFn).toHaveBeenCalledTimes(2);
    expect(fullFn).not.toHaveBeenCalled();
    unsubscribeFull();
    unsubscribeMine();
  });

  it('query đang tải lần đầu ⇒ không gọi mạng lần hai (gộp vào lượt đang bay) — kéo liên tiếp lúc bộ lọc đang tải không thành mưa request', async () => {
    const queryClient = client();
    const mineKey = boardKeys.tasks('b1', { assigneeId: 'me' });
    const mineFn = jest.fn(() => new Promise<BoardTasksData>((resolve) => setTimeout(() => resolve(makeData()), 0)));
    const unsubscribe = new QueryObserver(queryClient, { queryFn: mineFn, queryKey: mineKey }).subscribe(() => undefined);
    expect(queryClient.getQueryState(mineKey)?.fetchStatus).toBe('fetching');

    refetchEmptyBoardCaches(queryClient, 'b1');

    await waitFor(() => expect(queryClient.getQueryData(mineKey)).toBeDefined());
    expect(mineFn).toHaveBeenCalledTimes(1);
    unsubscribe();
  });
});
