import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { AxiosError } from 'axios';
import type { ReactNode } from 'react';

import { useConnectionState } from '@/core/socket';
import { useAuthStore } from '@/shell/store/slices/auth';

import { taskDetailService } from '../api/task-detail.service';
import { CONFLICT_SAVE_MESSAGE, useTaskDetailState } from '../hooks/useTaskDetailState';
import { makeDetail } from './detail-fixtures';

// Thư viện thật là ESM thuần nên Jest không nạp được — xem tests/mocks/fractional-indexing.ts.
jest.mock('fractional-indexing', () => jest.requireActual('./mocks/fractional-indexing'));
jest.mock('@/core/socket', () => ({
  ...jest.requireActual('@/core/socket'),
  useConnectionState: jest.fn(),
}));
jest.mock('../api/task-detail.service', () => ({
  taskDetailService: { get: jest.fn(), patch: jest.fn(), remove: jest.fn(), restore: jest.fn() },
}));
jest.mock('../queries/boards.queries', () => ({
  useBoard: () => ({ data: { archivedAt: null, columns: [], labels: [], myPermissions: [] } }),
}));
jest.mock('../queries/workspace-access.queries', () => ({
  useWorkspaceBoardAccess: () => ({ data: { myRole: 'MEMBER', status: 'ACTIVE' } }),
}));

const get = taskDetailService.get as jest.MockedFunction<typeof taskDetailService.get>;
const patch = taskDetailService.patch as jest.MockedFunction<typeof taskDetailService.patch>;
const connection = useConnectionState as jest.MockedFunction<typeof useConnectionState>;

function wrapperFor() {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { gcTime: Infinity, retry: false }, queries: { gcTime: Infinity, retry: false } },
  });
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }
  return Wrapper;
}

function conflict(): AxiosError {
  return new AxiosError('Conflict', 'ERR_BAD_REQUEST', undefined, undefined, {
    config: {} as never,
    data: { error: { code: 'RES_003' } },
    headers: {},
    status: 409,
    statusText: 'Conflict',
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.setState({ user: { id: 'u-me', name: 'Tôi' } as never });
  connection.mockReturnValue('connected');
  get.mockResolvedValue(makeDetail({ title: 'Bản của server', version: 3 }));
});

describe('useTaskDetailState', () => {
  it('409 RES_003 khi lưu: rollback, bật banner, tải lại chi tiết và trả câu lỗi để sheet GIỮ giá trị đang nhập', async () => {
    patch.mockRejectedValue(conflict());
    const { result } = await renderHook(() => useTaskDetailState('b1', 't1', 'w1'), { wrapper: wrapperFor() });
    await waitFor(() => expect(result.current.detail.data?.version).toBe(3));
    expect(result.current.conflict).toBe(false);

    let failure: string | null = null;
    await act(async () => {
      failure = await result.current.save({ optimistic: { title: 'Của tôi' }, patch: { title: 'Của tôi' } });
    });

    expect(failure).toBe(CONFLICT_SAVE_MESSAGE);
    expect(result.current.conflict).toBe(true);
    // Đã hoàn tác bản optimistic và gọi tải lại (lần 1 lúc mở + lần 2 sau 409).
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
    expect(result.current.detail.data?.title).toBe('Bản của server');

    await act(async () => result.current.dismissConflict());
    expect(result.current.conflict).toBe(false);
  });

  it('lưu thành công: trả null và xoá cờ conflict', async () => {
    patch.mockResolvedValue(makeDetail({ title: 'Mới', version: 4 }));
    const { result } = await renderHook(() => useTaskDetailState('b1', 't1', 'w1'), { wrapper: wrapperFor() });
    await waitFor(() => expect(result.current.detail.data).toBeDefined());

    let failure: string | null = 'chưa chạy';
    await act(async () => {
      failure = await result.current.save({ optimistic: { title: 'Mới' }, patch: { title: 'Mới' } });
    });

    expect(failure).toBeNull();
    expect(result.current.detail.data?.title).toBe('Mới');
  });

  it('offline: ẩn quyền sửa/bình luận và nói rõ lý do (composer "Kết nối lại để gửi")', async () => {
    connection.mockReturnValue('offline');
    const { result } = await renderHook(() => useTaskDetailState('b1', 't1', 'w1'), { wrapper: wrapperFor() });
    await waitFor(() => expect(result.current.detail.data).toBeDefined());

    expect(result.current.access).toMatchObject({ canComment: false, canEdit: false, readOnlyReason: 'offline' });
    expect(result.current.offline).toBe(true);
  });

  it('404 (thẻ đã xoá / người ngoài): notFound bật và không thử lại', async () => {
    get.mockRejectedValue(
      new AxiosError('x', 'ERR_BAD_REQUEST', undefined, undefined, {
        config: {} as never,
        data: {},
        headers: {},
        status: 404,
        statusText: 'Not Found',
      }),
    );
    const { result } = await renderHook(() => useTaskDetailState('b1', 't1', 'w1'), { wrapper: wrapperFor() });

    await waitFor(() => expect(result.current.notFound).toBe(true));
    expect(get).toHaveBeenCalledTimes(1);
  });
});
