import { act, renderHook, waitFor } from '@testing-library/react-native';
import { AxiosError } from 'axios';

import { showToast } from '@/shared/utils/toast.utils';

import { tasksService } from '../api/tasks.service';
import type { BoardTasksData, MoveTaskResult } from '../api/boards.types';
import { MOVE_CONFLICT_MESSAGE, useMoveTask } from '../hooks/useMoveTask';
import { boardKeys } from '../queries/boards.keys';
import { ids, makeTask } from './fixtures';
import { cache, conflict, MOVE_T1_DOWN, seed, setup } from './move-task-setup';

// Thư viện thật là ESM thuần nên Jest không nạp được — xem tests/mocks/fractional-indexing.ts.
jest.mock('fractional-indexing', () => jest.requireActual('./mocks/fractional-indexing'));
jest.mock('@/shared/utils/toast.utils', () => ({ showToast: jest.fn() }));
jest.mock('../api/tasks.service', () => ({
  ...jest.requireActual('../api/tasks.service'),
  tasksService: { create: jest.fn(), list: jest.fn(), move: jest.fn() },
}));

const mockedMove = tasksService.move as jest.MockedFunction<typeof tasksService.move>;
const mockedToast = showToast as jest.MockedFunction<typeof showToast>;

beforeEach(() => {
  jest.clearAllMocks();
});


describe('useMoveTask', () => {
  it('optimistic ngay lập tức, gọi API đúng hàng xóm + expectedVersion, rồi ghi kết quả THẬT', async () => {
    const { pending, queryClient, wrapper } = setup();
    let resolve: (value: MoveTaskResult) => void = () => undefined;
    mockedMove.mockReturnValue(new Promise((done) => (resolve = done)));
    const { result } = await renderHook(() => useMoveTask('b1', pending), { wrapper });

    await act(async () => result.current.move(MOVE_T1_DOWN));

    // Đang bay: t1 đã nằm cuối cột, mã của chính mình nằm trong `pending`.
    await waitFor(() => expect(ids(cache(queryClient), 'c_todo')).toEqual(['t2', 't3', 't1']));
    expect(pending.size).toBe(1);
    const [taskId, payload] = mockedMove.mock.calls[0] ?? [];
    expect(taskId).toBe('t1');
    expect(payload).toMatchObject({ afterTaskId: 't3', beforeTaskId: null, columnId: 'c_todo', expectedVersion: 1 });
    expect(payload?.clientMutationId.length).toBeGreaterThanOrEqual(8);
    expect(payload?.clientMutationId.length).toBeLessThanOrEqual(64);

    await act(async () => resolve({ columnId: 'c_todo', columnKind: 'TODO', completedAt: null, id: 't1', position: 'a4', version: 2 }));

    await waitFor(() => expect(pending.size).toBe(0));
    expect(cache(queryClient).columns.c_todo?.at(-1)).toMatchObject({ id: 't1', position: 'a4', version: 2 });
    expect(mockedToast).not.toHaveBeenCalled();
  });

  it('409 RES_003 kèm `current` ⇒ hoàn tác, ghi bản của server, toast "Thẻ đã được người khác di chuyển"', async () => {
    const { queryClient, wrapper, pending } = setup();
    const spy = jest.spyOn(queryClient, 'invalidateQueries');
    // Người khác đã dời t1 sang "Đang làm" (version 3) trước khi mình gửi. `current` ĐÚNG hình dạng BE trả (be.md §5 Move):
    // chỉ bản kết quả kéo — không có tiêu đề/nhãn/người làm.
    const current: MoveTaskResult = { columnId: 'c_doing', columnKind: 'IN_PROGRESS', completedAt: null, id: 't1', position: 'a2', version: 3 };
    mockedMove.mockRejectedValue(conflict(current));
    const { result } = await renderHook(() => useMoveTask('b1', pending), { wrapper });

    await act(async () => result.current.move(MOVE_T1_DOWN));

    await waitFor(() => expect(mockedToast).toHaveBeenCalledWith('warning', MOVE_CONFLICT_MESSAGE));
    expect(ids(cache(queryClient), 'c_todo')).toEqual(['t2', 't3']);
    expect(ids(cache(queryClient), 'c_doing')).toEqual(['d1', 't1']);
    // Thẻ GIỮ các trường mà `current` không mang — trước đây nó bị thay bằng chính `current` (mất tiêu đề, `labelIds` undefined ⇒ thẻ nổ).
    expect(cache(queryClient).columns.c_doing?.find((task) => task.id === 't1')).toMatchObject({
      assignees: [],
      labelIds: [],
      title: 'Thẻ t1',
      version: 3,
    });
    // `version` lệch ⇒ thẻ đã đổi ở nơi khác (có thể cả tiêu đề…) ⇒ vẫn tải lại.
    expect(spy).toHaveBeenCalledWith({ queryKey: boardKeys.tasksAll('b1') });
    expect(pending.size).toBe(0);
  });

  it('409 RES_003 khi đang có cache LỌC ("Của tôi") ⇒ không ném lỗi, thẻ không bị ghi bằng bản thiếu trường', async () => {
    const { queryClient, wrapper, pending } = setup();
    const mineKey = boardKeys.tasks('b1', { assigneeId: 'me' });
    queryClient.setQueryData(mineKey, seed());
    mockedMove.mockRejectedValue(
      conflict({ columnId: 'c_doing', columnKind: 'IN_PROGRESS', completedAt: null, id: 't1', position: 'a2', version: 3 }),
    );
    const { result } = await renderHook(() => useMoveTask('b1', pending), { wrapper });

    await act(async () => result.current.move(MOVE_T1_DOWN));

    await waitFor(() => expect(mockedToast).toHaveBeenCalledWith('warning', MOVE_CONFLICT_MESSAGE));
    const everyCard = (data: BoardTasksData) => Object.values(data.columns).flat();
    for (const data of [cache(queryClient), queryClient.getQueryData<BoardTasksData>(mineKey) as BoardTasksData]) {
      expect(everyCard(data).every((task) => typeof task.title === 'string' && Array.isArray(task.labelIds))).toBe(true);
    }
  });

  it('`current` sai hình dạng ⇒ bỏ qua nó, chỉ hoàn tác + tải lại', async () => {
    const { queryClient, wrapper, pending } = setup();
    mockedMove.mockRejectedValue(conflict({ id: 't1', version: 'ba' }));
    const { result } = await renderHook(() => useMoveTask('b1', pending), { wrapper });

    await act(async () => result.current.move(MOVE_T1_DOWN));

    await waitFor(() => expect(mockedToast).toHaveBeenCalledWith('warning', MOVE_CONFLICT_MESSAGE));
    expect(ids(cache(queryClient), 'c_todo')).toEqual(['t1', 't2', 't3']);
    expect(cache(queryClient).columns.c_todo?.[0]).toMatchObject({ title: 'Thẻ t1', version: 1 });
  });

  it('hai lượt kéo chồng nhau: lượt ĐẦU hỏng chỉ trả CHÍNH thẻ đó về chỗ cũ — lượt sau đã thành công vẫn giữ', async () => {
    const { queryClient, wrapper, pending } = setup();
    let failFirst: (error: unknown) => void = () => undefined;
    mockedMove
      .mockReturnValueOnce(new Promise<MoveTaskResult>((_resolve, reject) => (failFirst = reject)))
      .mockResolvedValueOnce({ columnId: 'c_doing', columnKind: 'IN_PROGRESS', completedAt: null, id: 't2', position: 'a2', version: 2 });
    const T2 = seed().columns.c_todo?.[1] ?? makeTask({ id: 't2' });
    const { result } = await renderHook(() => useMoveTask('b1', pending), { wrapper });

    await act(async () => result.current.move(MOVE_T1_DOWN));
    await act(async () =>
      result.current.move({ afterTaskId: 'd1', beforeTaskId: null, columnId: 'c_doing', columnKind: 'IN_PROGRESS', task: T2 }),
    );
    await waitFor(() => expect(cache(queryClient).columns.c_doing?.at(-1)).toMatchObject({ id: 't2', version: 2 }));

    await act(async () => failFirst(new AxiosError('Network Error', 'ERR_NETWORK')));

    await waitFor(() => expect(mockedToast).toHaveBeenCalledWith('error', expect.any(String)));
    expect(ids(cache(queryClient), 'c_todo')).toEqual(['t1', 't3']);
    expect(ids(cache(queryClient), 'c_doing')).toEqual(['d1', 't2']);
    expect(cache(queryClient).columns.c_doing?.at(-1)).toMatchObject({ id: 't2', version: 2 });
  });

  it('409 không kèm `current` ⇒ hoàn tác đúng về ảnh chụp và tải lại', async () => {
    const { queryClient, wrapper, pending } = setup();
    const spy = jest.spyOn(queryClient, 'invalidateQueries');
    mockedMove.mockRejectedValue(conflict());
    const { result } = await renderHook(() => useMoveTask('b1', pending), { wrapper });

    await act(async () => result.current.move(MOVE_T1_DOWN));

    await waitFor(() => expect(mockedToast).toHaveBeenCalledWith('warning', MOVE_CONFLICT_MESSAGE));
    expect(ids(cache(queryClient), 'c_todo')).toEqual(['t1', 't2', 't3']);
    expect(spy).toHaveBeenCalledWith({ queryKey: boardKeys.tasksAll('b1') });
  });

  it('lỗi mạng ⇒ hoàn tác + toast lỗi (không phải câu 409)', async () => {
    const { queryClient, wrapper, pending } = setup();
    mockedMove.mockRejectedValue(new AxiosError('Network Error', 'ERR_NETWORK'));
    const { result } = await renderHook(() => useMoveTask('b1', pending), { wrapper });

    await act(async () => result.current.move(MOVE_T1_DOWN));

    await waitFor(() => expect(mockedToast).toHaveBeenCalledWith('error', expect.any(String)));
    expect(mockedToast).not.toHaveBeenCalledWith('warning', MOVE_CONFLICT_MESSAGE);
    expect(ids(cache(queryClient), 'c_todo')).toEqual(['t1', 't2', 't3']);
  });

  it('hoàn tác cả các cache có bộ lọc khác của cùng bảng', async () => {
    const { queryClient, wrapper, pending } = setup();
    const mineKey = boardKeys.tasks('b1', { assigneeId: 'me' });
    queryClient.setQueryData(mineKey, seed());
    mockedMove.mockRejectedValue(conflict());
    const { result } = await renderHook(() => useMoveTask('b1', pending), { wrapper });

    await act(async () => result.current.move(MOVE_T1_DOWN));

    await waitFor(() => expect(mockedToast).toHaveBeenCalled());
    const mine = queryClient.getQueryData<BoardTasksData>(mineKey) as BoardTasksData;
    expect(ids(mine, 'c_todo')).toEqual(['t1', 't2', 't3']);
  });
});
