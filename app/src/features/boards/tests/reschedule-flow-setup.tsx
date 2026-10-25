import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { AxiosError } from 'axios';
import type { ReactNode } from 'react';

import type { ReschedulePreviewDto } from '../api/critical-path.types';
import { taskDetailService } from '../api/task-detail.service';
import { BoardScopeContext } from '../hooks/board-scope.context';
import { useSaveWithReschedule } from '../hooks/useSaveWithReschedule';
import { useTaskDetailState } from '../hooks/useTaskDetailState';
import { boardKeys } from '../queries/boards.keys';
import { makeData } from './fixtures';

/**
 * Dựng chung cho `useRescheduleFlow*.test.tsx`: ghép ĐÚNG như `useTaskDetailActions` (chi tiết thẻ + lưu-có-dời-lịch
 * của tấm ngày). Mỗi file test tự khai `jest.mock` cho `task-detail.service`, `reschedule.service`, `toast.utils`… —
 * `jest.mock` chỉ có hiệu lực trong file khai nó, nhưng module mock được dùng chung với helper này.
 */
export const NEW_DUE = '2026-09-30T16:59:59.000Z';

export function makePreview(overrides: Partial<ReschedulePreviewDto> = {}): ReschedulePreviewDto {
  return {
    affected: [
      {
        assigneeIds: [],
        newDueDate: '2026-10-03T16:59:59.000Z',
        newStartDate: null,
        oldDueDate: '2026-09-28T16:59:59.000Z',
        oldStartDate: null,
        shiftDays: 5,
        taskId: 't2',
        title: 'Thẻ t2',
      },
    ],
    affectedCount: 1,
    mode: 'SYNC',
    previewToken: 'a'.repeat(64),
    skipped: [],
    source: { newDueDate: NEW_DUE, oldDueDate: '2026-09-25T16:59:59.000Z', taskId: 't1', version: 3 },
    timezone: 'Asia/Ho_Chi_Minh',
    truncated: false,
    ...overrides,
  };
}

export function apiError(code: string, details?: unknown): AxiosError {
  return new AxiosError('Conflict', 'ERR_BAD_REQUEST', undefined, undefined, {
    config: {} as never,
    data: { error: { code, details } },
    headers: {},
    status: 409,
    statusText: 'Conflict',
  });
}

export const setActiveBatchId = jest.fn();

export function setup() {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { gcTime: Infinity, retry: false }, queries: { gcTime: Infinity, retry: false } },
  });
  queryClient.setQueryData(boardKeys.tasks('b1', {}), makeData());
  const scope = { activeBatchId: null, boardId: 'b1', pendingMutations: new Set<string>(), setActiveBatchId, wsId: 'w1' };
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <BoardScopeContext value={scope}>{children}</BoardScopeContext>
    </QueryClientProvider>
  );
  return { queryClient, wrapper };
}

/** Ghép ĐÚNG như `useTaskDetailActions`: trạng thái chi tiết + lưu-có-dời-lịch của tấm ngày. */
export function useHarness(onDone: () => void) {
  const state = useTaskDetailState('b1', 't1', 'w1');
  const saver = useSaveWithReschedule({ boardId: 'b1', detail: state.detail.data, onDone, save: state.save, taskId: 't1' });
  return { saver, state };
}

export const DATE_CHANGE = { dueDate: NEW_DUE };

export async function openSheetWith(preview: ReschedulePreviewDto) {
  (taskDetailService.patch as jest.Mock).mockRejectedValue(apiError('TASK_006', { preview }));
  const onDone = jest.fn();
  const { queryClient, wrapper } = setup();
  const hook = await renderHook(() => useHarness(onDone), { wrapper });
  await waitFor(() => expect(hook.result.current.state.detail.data?.version).toBe(3));
  await act(async () => {
    await hook.result.current.saver.commit({ optimistic: DATE_CHANGE, patch: DATE_CHANGE });
  });
  return { ...hook, onDone, queryClient };
}
