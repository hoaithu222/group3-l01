import { act, renderHook, waitFor } from '@testing-library/react-native';

import { useConnectionState } from '@/core/socket';
import { useAuthStore } from '@/shell/store/slices/auth';
import { showToast } from '@/shared/utils/toast.utils';

import { rescheduleService } from '../api/reschedule.service';
import { taskDetailService } from '../api/task-detail.service';
import type { TaskDetailDto } from '../api/task-detail.types';
import { taskKeys } from '../queries/task-detail.keys';
import { makeDetail } from './detail-fixtures';
import { apiError, makePreview, openSheetWith, setActiveBatchId, setup, useHarness } from './reschedule-flow-setup';

// Thư viện thật là ESM thuần nên Jest không nạp được — xem tests/mocks/fractional-indexing.ts.
jest.mock('fractional-indexing', () => jest.requireActual('./mocks/fractional-indexing'));
jest.mock('@/core/socket', () => ({
  ...jest.requireActual('@/core/socket'),
  useConnectionState: jest.fn(),
}));
jest.mock('@/shared/utils/toast.utils', () => ({ showToast: jest.fn() }));
jest.mock('../api/task-detail.service', () => ({
  taskDetailService: { get: jest.fn(), patch: jest.fn(), remove: jest.fn(), restore: jest.fn() },
}));
jest.mock('../api/reschedule.service', () => ({
  rescheduleService: { apply: jest.fn(), batch: jest.fn(), preview: jest.fn() },
}));
jest.mock('../queries/boards.queries', () => ({
  useBoard: () => ({ data: { archivedAt: null, columns: [], labels: [], myPermissions: [] } }),
}));
jest.mock('../queries/workspace-access.queries', () => ({
  useWorkspaceBoardAccess: () => ({ data: { myRole: 'MEMBER', status: 'ACTIVE' } }),
}));

const get = taskDetailService.get as jest.MockedFunction<typeof taskDetailService.get>;
const patch = taskDetailService.patch as jest.MockedFunction<typeof taskDetailService.patch>;
const apply = rescheduleService.apply as jest.MockedFunction<typeof rescheduleService.apply>;
const connection = useConnectionState as jest.MockedFunction<typeof useConnectionState>;
const toast = showToast as jest.MockedFunction<typeof showToast>;

beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.setState({ user: { id: 'u-me', name: 'Tôi' } as never });
  connection.mockReturnValue('connected');
  get.mockResolvedValue(makeDetail({ dueDate: '2026-09-25T16:59:59.000Z', startDate: '2026-09-20T00:00:00.000Z', version: 3 }));
});

describe('PATCH bị TASK_006 → kết quả xác nhận khác', () => {
  it('202: nhớ batchId ở phạm vi bảng (banner) và báo "Đang dời lịch N thẻ…"', async () => {
    apply.mockResolvedValue({ affectedCount: 250, batchId: 'batch-9', kind: 'queued' });
    const { onDone, result } = await openSheetWith(makePreview({ affectedCount: 250, mode: 'BULK' }));

    await act(async () => result.current.saver.reschedule.confirm());

    await waitFor(() => expect(setActiveBatchId).toHaveBeenCalledWith('batch-9'));
    expect(toast).toHaveBeenCalledWith('info', 'Đang dời lịch 250 thẻ…');
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('TASK_020: tấm ở lại, hiện "Bảng đang dời lịch, thử lại sau", không đóng', async () => {
    apply.mockRejectedValue(apiError('TASK_020'));
    const { result } = await openSheetWith(makePreview());

    await act(async () => result.current.saver.reschedule.confirm());

    await waitFor(() => expect(result.current.saver.reschedule.session?.error).toBe('Bảng đang dời lịch, thử lại sau'));
    expect(result.current.saver.reschedule.session).not.toBeNull();
  });

  it('RES_003 (thẻ nguồn vừa bị sửa): đóng tấm, báo, tải lại chi tiết', async () => {
    apply.mockRejectedValue(apiError('RES_003'));
    const { queryClient, result } = await openSheetWith(makePreview());
    const spy = jest.spyOn(queryClient, 'invalidateQueries');

    await act(async () => result.current.saver.reschedule.confirm());

    await waitFor(() => expect(result.current.saver.reschedule.session).toBeNull());
    expect(toast).toHaveBeenCalledWith('warning', expect.stringContaining('vừa được người khác thay đổi'));
    expect(spy).toHaveBeenCalledWith({ queryKey: taskKeys.detail('t1') });
  });

  it('không dựng được ngày mới (thẻ không có hạn) mà vẫn bị TASK_006: hiện câu lỗi thay vì treo tấm', async () => {
    get.mockResolvedValue({ ...makeDetail({ version: 3 }), dueDate: null } as TaskDetailDto);
    patch.mockRejectedValue(apiError('TASK_006', { preview: makePreview() }));
    const { wrapper } = setup();
    const { result } = await renderHook(() => useHarness(jest.fn()), { wrapper });
    await waitFor(() => expect(result.current.state.detail.data?.version).toBe(3));

    await act(async () => {
      await result.current.saver.commit({ optimistic: {}, patch: { startDate: '2026-09-20T00:00:00.000Z' } });
    });

    expect(result.current.saver.reschedule.session).toBeNull();
    expect(result.current.saver.error).toMatch(/dời lịch/);
  });
});
