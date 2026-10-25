import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import type { BoardTasksData } from '../api/boards.types';
import type { DependencyTaskDto, TaskDependenciesDto } from '../api/critical-path.types';
import { dependenciesService } from '../api/dependencies.service';
import type { TaskDetailDto } from '../api/task-detail.types';
import { useAddDependency, useRemoveDependency } from '../queries/dependencies.queries';
import { boardKeys } from '../queries/boards.keys';
import { taskKeys } from '../queries/task-detail.keys';
import { adjustCounts, applyDependencyDelta } from '../utils/dependency-cache';
import { applyRescheduled } from '../utils/reschedule-cache';
import { makeDetail } from './detail-fixtures';
import { makeData, makeTask } from './fixtures';

// Thư viện thật là ESM thuần nên Jest không nạp được — xem tests/mocks/fractional-indexing.ts.
jest.mock('fractional-indexing', () => jest.requireActual('./mocks/fractional-indexing'));
jest.mock('../api/dependencies.service', () => ({
  dependenciesService: { add: jest.fn(), list: jest.fn(), remove: jest.fn() },
}));

const add = dependenciesService.add as jest.MockedFunction<typeof dependenciesService.add>;
const remove = dependenciesService.remove as jest.MockedFunction<typeof dependenciesService.remove>;

const BOARD_KEY = boardKeys.tasks('b1', {});

function other(id: string, columnKind: DependencyTaskDto['columnKind'] = 'TODO'): DependencyTaskDto {
  return { assignees: [], columnKind, dueDate: null, id, startDate: null, title: `Thẻ ${id}` };
}

function setup() {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { gcTime: Infinity, retry: false }, queries: { gcTime: Infinity, retry: false } },
  });
  queryClient.setQueryData(BOARD_KEY, makeData());
  queryClient.setQueryData(taskKeys.detail('t1'), makeDetail({ version: 3 }));
  queryClient.setQueryData<TaskDependenciesDto>(taskKeys.dependencies('t1'), { predecessors: [], successors: [] });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, wrapper };
}

const card = (client: QueryClient, id: string) =>
  Object.values(client.getQueryData<BoardTasksData>(BOARD_KEY)?.columns ?? {})
    .flat()
    .find((item) => item.id === id);

describe('adjustCounts — quy tắc bộ đếm của BE (be.md §5.1)', () => {
  const t = makeTask({ blockedByCount: 1, blockingCount: 1, id: 'x' });

  it('chỉ tính thẻ ĐỐI DIỆN chưa DONE; không bao giờ âm', () => {
    expect(adjustCounts(t, 'successor', 'TODO', 1).blockedByCount).toBe(2);
    expect(adjustCounts(t, 'predecessor', 'IN_PROGRESS', 1).blockingCount).toBe(2);
    expect(adjustCounts(t, 'successor', 'DONE', 1)).toBe(t);
    expect(adjustCounts({ ...t, blockedByCount: 0 }, 'successor', 'TODO', -1).blockedByCount).toBe(0);
  });
});

describe('useAddDependency / useRemoveDependency', () => {
  it('thêm thẻ CHẶN mới (201): danh sách có thẻ đó; bộ đếm chip của HAI thẻ tăng ngay (t1 bị chặn, t2 đang chặn)', async () => {
    add.mockResolvedValue({ created: true, dependency: {} as never });
    const { queryClient, wrapper } = setup();
    const { result } = await renderHook(() => useAddDependency('b1', 't1'), { wrapper });

    await act(async () => {
      result.current.mutate({ direction: 'predecessor', other: other('t2') });
    });

    await waitFor(() => expect(add).toHaveBeenCalledWith('t1', 't2'));
    await waitFor(() => expect(card(queryClient, 't1')?.blockedByCount).toBe(1));
    expect(card(queryClient, 't2')?.blockingCount).toBe(1);
    expect(queryClient.getQueryData<TaskDetailDto>(taskKeys.detail('t1'))?.blockedByCount).toBe(1);
    expect(queryClient.getQueryData<TaskDependenciesDto>(taskKeys.dependencies('t1'))?.predecessors.map((item) => item.id)).toEqual(['t2']);
  });

  it('cạnh đã có (200 bản cũ): KHÔNG cộng bộ đếm lần hai', async () => {
    add.mockResolvedValue({ created: false, dependency: {} as never });
    const { queryClient, wrapper } = setup();
    const { result } = await renderHook(() => useAddDependency('b1', 't1'), { wrapper });

    await act(async () => {
      result.current.mutate({ direction: 'predecessor', other: other('t2') });
    });

    await waitFor(() => expect(add).toHaveBeenCalled());
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(card(queryClient, 't1')?.blockedByCount).toBe(0);
    expect(card(queryClient, 't2')?.blockingCount).toBe(0);
  });

  it('thẻ trước đã DONE: thêm cạnh không làm thẻ sau "bị chặn"', async () => {
    add.mockResolvedValue({ created: true, dependency: {} as never });
    const { queryClient, wrapper } = setup();
    const { result } = await renderHook(() => useAddDependency('b1', 't1'), { wrapper });

    await act(async () => {
      result.current.mutate({ direction: 'predecessor', other: other('t2', 'DONE') });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(card(queryClient, 't1')?.blockedByCount).toBe(0);
    // t2 (đã DONE) vẫn "đang chặn" t1 chưa xong.
    expect(card(queryClient, 't2')?.blockingCount).toBe(1);
  });

  it('gỡ thẻ SAU: đảo hướng đúng (thẻ này là thẻ trước) và giảm bộ đếm', async () => {
    remove.mockResolvedValue(undefined);
    const { queryClient, wrapper } = setup();
    applyDependencyDelta(queryClient, 'b1', { predecessor: { columnKind: 'TODO', id: 't1' }, successor: { columnKind: 'TODO', id: 't2' } }, 1);
    expect(card(queryClient, 't1')?.blockingCount).toBe(1);
    const { result } = await renderHook(() => useRemoveDependency('b1', 't1'), { wrapper });

    await act(async () => {
      result.current.mutate({ direction: 'successor', other: other('t2') });
    });

    await waitFor(() => expect(remove).toHaveBeenCalledWith('t2', 't1'));
    await waitFor(() => expect(card(queryClient, 't1')?.blockingCount).toBe(0));
    expect(card(queryClient, 't2')?.blockedByCount).toBe(0);
  });

  it('lỗi (TASK_005…) KHÔNG đụng cache: không có thẻ nào bị đếm oan', async () => {
    add.mockRejectedValue(new Error('vòng'));
    const { queryClient, wrapper } = setup();
    const { result } = await renderHook(() => useAddDependency('b1', 't1'), { wrapper });

    await act(async () => {
      result.current.mutate({ direction: 'predecessor', other: other('t2') });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(card(queryClient, 't1')?.blockedByCount).toBe(0);
    expect(queryClient.getQueryData<TaskDependenciesDto>(taskKeys.dependencies('t1'))?.predecessors).toEqual([]);
  });
});

describe('applyRescheduled — kết quả dời lịch vào cache', () => {
  it('vá dueDate/isOverdue/version cho thẻ mini và chi tiết; bỏ qua bản CŨ hơn (socket tới trước HTTP)', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
    const data = makeData();
    // t3 đã ở version 9 trong CẢ HAI cache — phản hồi version 4 là bản cũ.
    data.columns.c_todo = (data.columns.c_todo ?? []).map((item) => (item.id === 't3' ? { ...item, version: 9 } : item));
    queryClient.setQueryData(BOARD_KEY, data);
    queryClient.setQueryData(taskKeys.detail('t2'), makeDetail({ dueDate: null, id: 't2', startDate: null, version: 2 }));
    queryClient.setQueryData(taskKeys.detail('t3'), makeDetail({ id: 't3', version: 9 }));

    applyRescheduled(queryClient, 'b1', [
      { newDueDate: '2030-01-10T00:00:00.000Z', newStartDate: '2030-01-08T00:00:00.000Z', taskId: 't2', version: 5 },
      { newDueDate: '2030-01-11T00:00:00.000Z', newStartDate: null, taskId: 't3', version: 4 },
    ]);

    expect(card(queryClient, 't2')).toMatchObject({ dueDate: '2030-01-10T00:00:00.000Z', isOverdue: false, version: 5 });
    expect(queryClient.getQueryData<TaskDetailDto>(taskKeys.detail('t2'))).toMatchObject({
      dueDate: '2030-01-10T00:00:00.000Z',
      startDate: '2030-01-08T00:00:00.000Z',
      version: 5,
    });
    // t3 đã ở version 9 > 4: giữ nguyên.
    expect(queryClient.getQueryData<TaskDetailDto>(taskKeys.detail('t3'))?.version).toBe(9);
    expect(card(queryClient, 't3')?.dueDate).toBeNull();
  });

  it('danh sách rỗng ⇒ không đụng gì', () => {
    // `gcTime: Infinity`: không tạo bộ hẹn giờ dọn cache 5 phút (giữ tiến trình Jest sống sau khi test xong).
    const queryClient = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
    queryClient.setQueryData(BOARD_KEY, makeData());
    const before = queryClient.getQueryData(BOARD_KEY);
    applyRescheduled(queryClient, 'b1', []);
    expect(queryClient.getQueryData(BOARD_KEY)).toBe(before);
  });
});
