import { act, renderHook, waitFor } from '@testing-library/react-native';

import { useConnectionState } from '@/core/socket';
import { useAuthStore } from '@/shell/store/slices/auth';
import { showToast } from '@/shared/utils/toast.utils';

import { rescheduleService } from '../api/reschedule.service';
import { taskDetailService } from '../api/task-detail.service';
import { RESCHEDULE_PENDING } from '../constants/critical-path.constants';
import { useTaskDetailState } from '../hooks/useTaskDetailState';
import { boardKeys } from '../queries/boards.keys';
import type { RescheduleApplyResult } from '../api/critical-path.types';
import { makeDetail } from './detail-fixtures';
import { apiError, DATE_CHANGE, makePreview, NEW_DUE, openSheetWith, setup } from './reschedule-flow-setup';

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

describe('PATCH bị TASK_006 → tấm cảnh báo dời lịch', () => {
  it('mở tấm với danh sách của preview; KHÔNG đóng tấm ngày, KHÔNG báo lỗi, bản optimistic đã hoàn tác', async () => {
    const preview = makePreview();
    const { onDone, result } = await openSheetWith(preview);

    expect(result.current.saver.reschedule.session?.preview.affected.map((item) => item.taskId)).toEqual(['t2']);
    expect(result.current.saver.reschedule.session?.change).toEqual({
      dueDate: NEW_DUE,
      startDate: '2026-09-20T00:00:00.000Z',
    });
    expect(result.current.saver.error).toBeNull();
    expect(onDone).not.toHaveBeenCalled();
    expect(result.current.state.detail.data?.dueDate).toBe('2026-09-25T16:59:59.000Z');
    expect(toast).not.toHaveBeenCalled();
  });

  it('save() trả RESCHEDULE_PENDING và gọi onReschedule; không truyền callback thì rơi về lỗi thường', async () => {
    patch.mockRejectedValue(apiError('TASK_006', { preview: makePreview() }));
    const { wrapper } = setup();
    const { result } = await renderHook(() => useTaskDetailState('b1', 't1', 'w1'), { wrapper });
    await waitFor(() => expect(result.current.detail.data).toBeDefined());

    const onReschedule = jest.fn();
    let outcome: string | null = null;
    await act(async () => {
      outcome = await result.current.save({ optimistic: DATE_CHANGE, patch: DATE_CHANGE }, onReschedule);
    });
    expect(outcome).toBe(RESCHEDULE_PENDING);
    expect(onReschedule).toHaveBeenCalledTimes(1);

    await act(async () => {
      outcome = await result.current.save({ optimistic: DATE_CHANGE, patch: DATE_CHANGE });
    });
    expect(outcome).not.toBe(RESCHEDULE_PENDING);
    expect(outcome).toBeTruthy();
  });

  it('Huỷ: đóng tấm, KHÔNG gọi reschedule, tấm ngày còn nguyên (onDone không chạy)', async () => {
    const { onDone, result } = await openSheetWith(makePreview());

    await act(async () => result.current.saver.reschedule.cancel());

    expect(result.current.saver.reschedule.session).toBeNull();
    expect(apply).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
  });

  it('Xác nhận 200: gửi ĐÚNG token + expectedVersion của preview, vá thẻ đã dời vào cache, báo kết quả, đóng tấm ngày', async () => {
    const applied: RescheduleApplyResult = {
      applied: [{ newDueDate: '2026-10-03T16:59:59.000Z', newStartDate: null, taskId: 't2', version: 5 }],
      kind: 'applied',
      rescheduleId: 'r1',
      skipped: [{ reason: 'DONE', taskId: 't9', title: 'Thẻ t9' }],
    };
    apply.mockResolvedValue(applied);
    const { onDone, queryClient, result } = await openSheetWith(makePreview());

    await act(async () => result.current.saver.reschedule.confirm());

    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(apply).toHaveBeenCalledWith('t1', {
      dueDate: NEW_DUE,
      expectedVersion: 3,
      previewToken: 'a'.repeat(64),
      startDate: '2026-09-20T00:00:00.000Z',
    });
    expect(toast).toHaveBeenCalledWith('success', 'Đã dời 1 thẻ, bỏ qua 1 thẻ đã xong');
    expect(result.current.saver.reschedule.session).toBeNull();
    const moved = queryClient
      .getQueryData<{ columns: Record<string, { dueDate: string | null; id: string; version: number }[]> }>(
        boardKeys.tasks('b1', {}),
      )
      ?.columns.c_todo?.find((card) => card.id === 't2');
    expect(moved).toMatchObject({ dueDate: '2026-10-03T16:59:59.000Z', version: 5 });
  });

  it('TASK_019: THAY danh sách bằng preview mới + cờ refreshed; nút Dời lịch lần sau dùng token MỚI', async () => {
    const fresh = makePreview({
      affected: [],
      affectedCount: 0,
      previewToken: 'b'.repeat(64),
      source: { newDueDate: NEW_DUE, oldDueDate: null, taskId: 't1', version: 4 },
    });
    apply.mockRejectedValueOnce(apiError('TASK_019', { preview: fresh }));
    apply.mockResolvedValueOnce({ applied: [], kind: 'applied', rescheduleId: 'r2', skipped: [] });
    const { result } = await openSheetWith(makePreview());

    await act(async () => result.current.saver.reschedule.confirm());
    await waitFor(() => expect(result.current.saver.reschedule.session?.refreshed).toBe(true));
    expect(result.current.saver.reschedule.session?.preview.affected).toEqual([]);
    expect(result.current.saver.reschedule.session?.error).toBeNull();

    await act(async () => result.current.saver.reschedule.confirm());
    await waitFor(() => expect(apply).toHaveBeenCalledTimes(2));
    expect(apply).toHaveBeenLastCalledWith('t1', expect.objectContaining({ expectedVersion: 4, previewToken: 'b'.repeat(64) }));
  });
});
