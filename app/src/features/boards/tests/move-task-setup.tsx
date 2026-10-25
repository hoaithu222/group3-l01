import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import type { ReactNode } from 'react';

import type { BoardTasksData } from '../api/boards.types';
import { boardKeys } from '../queries/boards.keys';
import { makeData, makeTask } from './fixtures';

/**
 * Dựng chung cho `useMoveTask.test.tsx` — tách ra để file test giữ dưới trần 200 dòng của `check:file-size`.
 * File test tự khai `jest.mock` cho `fractional-indexing`, `tasks.service`, `toast.utils` — `jest.mock` chỉ có hiệu
 * lực trong file khai nó, nhưng module mock được dùng chung với helper này.
 */
const KEY = boardKeys.tasks('b1', {});

/** Khoá không kết thúc bằng "0" — giới hạn của bản thay thế thư viện (xem `mocks/fractional-indexing.ts`). */
export function seed(): BoardTasksData {
  const data = makeData();
  const keys = ['a1', 'a2', 'a3'];
  data.columns.c_todo = (data.columns.c_todo ?? []).map((task, i) => ({ ...task, position: keys[i] ?? 'a9' }));
  data.columns.c_doing = (data.columns.c_doing ?? []).map((task) => ({ ...task, position: 'a1' }));
  return data;
}

export function setup() {
  // `gcTime: Infinity`: không tạo bộ hẹn giờ dọn cache (giữ tiến trình Jest sống sau khi test xong) và không dọn mất cache đã nạp bằng `setQueryData` khi chưa có observer.
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { gcTime: Infinity, retry: false }, queries: { gcTime: Infinity, retry: false } },
  });
  queryClient.setQueryData(KEY, seed());
  const pending = new Set<string>();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { pending, queryClient, wrapper };
}

export function cache(queryClient: QueryClient): BoardTasksData {
  return queryClient.getQueryData<BoardTasksData>(KEY) as BoardTasksData;
}

const T1 = seed().columns.c_todo?.[0] ?? makeTask({ id: 't1' });

/** "t1" xuống cuối cột Cần làm (sau t3). */
export const MOVE_T1_DOWN = {
  afterTaskId: 't3',
  beforeTaskId: null,
  columnId: 'c_todo',
  columnKind: 'TODO' as const,
  task: T1,
};

export function conflict(current?: unknown): AxiosError {
  return new AxiosError('Conflict', 'ERR_BAD_REQUEST', undefined, undefined, {
    config: {} as never,
    data: { error: { code: 'RES_003', details: current ? { current } : undefined } },
    headers: {},
    status: 409,
    statusText: 'Conflict',
  });
}
