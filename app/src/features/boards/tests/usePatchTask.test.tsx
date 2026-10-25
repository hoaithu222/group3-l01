import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { AxiosError } from 'axios';
import type { ReactNode } from 'react';

import type { BoardTasksData } from '../api/boards.types';
import { taskDetailService } from '../api/task-detail.service';
import type { TaskDetailDto } from '../api/task-detail.types';
import { boardKeys } from '../queries/boards.keys';
import { taskKeys } from '../queries/task-detail.keys';
import { usePatchTask } from '../queries/task-detail.queries';
import { makeDetail } from './detail-fixtures';
import { makeData } from './fixtures';

// Thư viện thật là ESM thuần nên Jest không nạp được — xem tests/mocks/fractional-indexing.ts.
jest.mock('fractional-indexing', () => jest.requireActual('./mocks/fractional-indexing'));
jest.mock('../api/task-detail.service', () => ({
  taskDetailService: { get: jest.fn(), patch: jest.fn(), remove: jest.fn(), restore: jest.fn() },
}));

const patch = taskDetailService.patch as jest.MockedFunction<typeof taskDetailService.patch>;
const BOARD_KEY = boardKeys.tasks('b1', {});
const DETAIL_KEY = taskKeys.detail('t1');

function setup() {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { gcTime: Infinity, retry: false }, queries: { gcTime: Infinity, retry: false } },
  });
  queryClient.setQueryData(DETAIL_KEY, makeDetail({ title: 'Tên cũ', version: 3 }));
  queryClient.setQueryData(BOARD_KEY, makeData());
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, wrapper };
}

const detail = (client: QueryClient) => client.getQueryData<TaskDetailDto>(DETAIL_KEY);
const boardTitle = (client: QueryClient) =>
  client.getQueryData<BoardTasksData>(BOARD_KEY)?.columns.c_todo?.find((task) => task.id === 't1')?.title;

function conflict(): AxiosError {
  return new AxiosError('Conflict', 'ERR_BAD_REQUEST', undefined, undefined, {
    config: {} as never,
    data: { error: { code: 'RES_003' } },
    headers: {},
    status: 409,
    statusText: 'Conflict',
  });
}

beforeEach(() => jest.clearAllMocks());

describe('usePatchTask', () => {
  it('optimistic: tiêu đề đổi ở CHI TIẾT và thẻ mini ngay; gửi kèm expectedVersion đọc từ cache', async () => {
    let resolve: (value: TaskDetailDto) => void = () => undefined;
    patch.mockReturnValue(new Promise((done) => (resolve = done)));
    const { queryClient, wrapper } = setup();
    const { result } = await renderHook(() => usePatchTask('b1', 't1'), { wrapper });

    await act(async () => {
      result.current.mutate({ optimistic: { title: 'Tên mới' }, patch: { title: 'Tên mới' } });
    });

    await waitFor(() => expect(detail(queryClient)?.title).toBe('Tên mới'));
    expect(boardTitle(queryClient)).toBe('Tên mới');
    expect(patch).toHaveBeenCalledWith('t1', { expectedVersion: 3, title: 'Tên mới' });

    resolve(makeDetail({ title: 'Tên mới', version: 4 }));
    await waitFor(() => expect(detail(queryClient)?.version).toBe(4));
    expect(boardTitle(queryClient)).toBe('Tên mới');
  });

  it('409 RES_003 ⇒ hoàn tác CẢ chi tiết lẫn thẻ mini, và lỗi được ném ra cho nơi gọi xử lý banner', async () => {
    patch.mockRejectedValue(conflict());
    const { queryClient, wrapper } = setup();
    const { result } = await renderHook(() => usePatchTask('b1', 't1'), { wrapper });

    await act(async () => {
      await expect(
        result.current.mutateAsync({ optimistic: { title: 'Của tôi' }, patch: { title: 'Của tôi' } }),
      ).rejects.toBeInstanceOf(AxiosError);
    });

    expect(detail(queryClient)?.title).toBe('Tên cũ');
    expect(boardTitle(queryClient)).toBe('Thẻ t1');
  });

  it('người làm: hiện tên NGAY từ bản optimistic dù PATCH chỉ mang id', async () => {
    patch.mockReturnValue(new Promise(() => undefined));
    const { queryClient, wrapper } = setup();
    const { result } = await renderHook(() => usePatchTask('b1', 't1'), { wrapper });
    const minh = { avatarUrl: null, id: 'u-minh', name: 'Minh' };

    await act(async () => {
      result.current.mutate({ optimistic: { assignees: [minh] }, patch: { assigneeIds: ['u-minh'] } });
    });

    await waitFor(() => expect(detail(queryClient)?.assignees).toEqual([minh]));
    expect(patch).toHaveBeenCalledWith('t1', { assigneeIds: ['u-minh'], expectedVersion: 3 });
  });

  it('chưa có chi tiết thật trong cache (chỉ bản giữ chỗ) ⇒ từ chối, không gửi PATCH với version bịa', async () => {
    // `gcTime: Infinity`: không tạo bộ hẹn giờ dọn cache 5 phút (giữ tiến trình Jest sống sau khi test xong).
    const queryClient = new QueryClient({ defaultOptions: { mutations: { gcTime: Infinity, retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = await renderHook(() => usePatchTask('b1', 't1'), { wrapper });

    await act(async () => {
      await expect(result.current.mutateAsync({ optimistic: {}, patch: { title: 'x' } })).rejects.toThrow();
    });
    expect(patch).not.toHaveBeenCalled();
  });
});
