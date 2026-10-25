import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { AxiosError } from 'axios';
import type { ReactNode } from 'react';

import { showToast } from '@/shared/utils/toast.utils';

import { tasksService } from '../api/tasks.service';
import type { BoardTasksData } from '../api/boards.types';
import { boardKeys } from '../queries/boards.keys';
import { tempTaskId, useCreateTask } from '../queries/tasks.queries';
import { applyTaskEvent } from '../utils/apply-task-event';
import { ids, makeData, makeTask } from './fixtures';

// Thư viện thật là ESM thuần nên Jest không nạp được — xem tests/mocks/fractional-indexing.ts.
jest.mock('fractional-indexing', () => jest.requireActual('./mocks/fractional-indexing'));
jest.mock('@/shared/utils/toast.utils', () => ({ showToast: jest.fn() }));
jest.mock('../api/tasks.service', () => ({
  ...jest.requireActual('../api/tasks.service'),
  tasksService: { create: jest.fn(), list: jest.fn(), move: jest.fn() },
}));

const mockedCreate = tasksService.create as jest.MockedFunction<typeof tasksService.create>;
const mockedToast = showToast as jest.MockedFunction<typeof showToast>;
const KEY = boardKeys.tasks('b1', {});
const INPUT = { columnId: 'c_todo', columnKind: 'TODO' as const, idempotencyKey: 'task-abc', title: 'Viết báo cáo' };

function setup() {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { gcTime: Infinity, retry: false }, queries: { gcTime: Infinity, retry: false } } });
  const data = makeData();
  data.columns.c_todo = (data.columns.c_todo ?? []).map((task, i) => ({ ...task, position: ['a1', 'a2', 'a3'][i] ?? 'a9' }));
  queryClient.setQueryData(KEY, data);
  const pending = new Set<string>();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { pending, queryClient, wrapper };
}

const cache = (queryClient: QueryClient) => queryClient.getQueryData<BoardTasksData>(KEY) as BoardTasksData;

beforeEach(() => jest.clearAllMocks());

describe('useCreateTask', () => {
  it('chèn thẻ tạm ở CUỐI cột ngay lập tức, gửi Idempotency-Key, rồi thay bằng thẻ server', async () => {
    const { pending, queryClient, wrapper } = setup();
    let resolve: (task: ReturnType<typeof makeTask>) => void = () => undefined;
    mockedCreate.mockReturnValue(new Promise((done) => (resolve = done)));
    const { result } = await renderHook(() => useCreateTask('b1', {}, pending), { wrapper });

    await act(async () => result.current.mutate(INPUT));

    await waitFor(() => expect(ids(cache(queryClient), 'c_todo').at(-1)).toBe(tempTaskId('task-abc')));
    // `clientMutationId` = Idempotency-Key ⇒ `task:created` của chính mình bị `useBoardRealtime` bỏ qua.
    expect(mockedCreate).toHaveBeenCalledWith(
      'b1',
      { clientMutationId: 'task-abc', columnId: 'c_todo', title: 'Viết báo cáo' },
      'task-abc',
    );
    expect(pending.has('task-abc')).toBe(true);

    await act(async () => resolve(makeTask({ id: 'real1', position: 'a4', title: 'Viết báo cáo' })));

    await waitFor(() => expect(pending.size).toBe(0));
    expect(ids(cache(queryClient), 'c_todo')).toEqual(['t1', 't2', 't3', 'real1']);
  });

  it('task:created của CHÍNH MÌNH tới TRƯỚC phản hồi HTTP ⇒ không có hai thẻ trùng', async () => {
    const { pending, queryClient, wrapper } = setup();
    let resolve: (task: ReturnType<typeof makeTask>) => void = () => undefined;
    mockedCreate.mockReturnValue(new Promise((done) => (resolve = done)));
    const { result } = await renderHook(() => useCreateTask('b1', {}, pending), { wrapper });
    await act(async () => result.current.mutate(INPUT));
    await waitFor(() => expect(pending.size).toBe(1));

    const real = makeTask({ id: 'real1', position: 'a4', title: 'Viết báo cáo' });
    // Sự kiện realtime tới trước: reducer chèn thẻ thật cạnh thẻ tạm.
    await act(async () => {
      queryClient.setQueryData<BoardTasksData>(KEY, (data) =>
        data && applyTaskEvent(data, { task: real, type: 'created' }, { filter: {} }).data,
      );
    });
    await act(async () => resolve(real));

    await waitFor(() => expect(pending.size).toBe(0));
    expect(ids(cache(queryClient), 'c_todo')).toEqual(['t1', 't2', 't3', 'real1']);
  });

  it('lỗi ⇒ hoàn tác thẻ tạm + toast lỗi (ở hook, không phụ thuộc callback của từng lượt `mutate`)', async () => {
    const { pending, queryClient, wrapper } = setup();
    mockedCreate.mockRejectedValue(new AxiosError('Network Error', 'ERR_NETWORK'));
    const { result } = await renderHook(() => useCreateTask('b1', {}, pending), { wrapper });

    await act(async () => result.current.mutate(INPUT));

    await waitFor(() => expect(pending.size).toBe(0));
    expect(ids(cache(queryClient), 'c_todo')).toEqual(['t1', 't2', 't3']);
    expect(mockedToast).toHaveBeenCalledWith('error', expect.any(String));
  });

  it('thêm liên tiếp: thẻ ĐẦU lỗi SAU khi thẻ sau đã tạo xong ⇒ chỉ gỡ thẻ tạm của thẻ đầu, thẻ sau giữ nguyên, vẫn có toast', async () => {
    const { pending, queryClient, wrapper } = setup();
    let failFirst: (error: unknown) => void = () => undefined;
    mockedCreate
      .mockReturnValueOnce(new Promise((_resolve, reject) => (failFirst = reject)))
      .mockResolvedValueOnce(makeTask({ id: 'real2', position: 'a5', title: 'Thẻ hai' }));
    const { result } = await renderHook(() => useCreateTask('b1', {}, pending), { wrapper });

    await act(async () => result.current.mutate(INPUT));
    await act(async () => result.current.mutate({ ...INPUT, idempotencyKey: 'task-def', title: 'Thẻ hai' }));
    await waitFor(() => expect(ids(cache(queryClient), 'c_todo')).toContain('real2'));

    await act(async () => failFirst(new AxiosError('Network Error', 'ERR_NETWORK')));

    await waitFor(() => expect(mockedToast).toHaveBeenCalledWith('error', expect.any(String)));
    expect(ids(cache(queryClient), 'c_todo')).toEqual(['t1', 't2', 't3', 'real2']);
    expect(pending.size).toBe(0);
  });
});
