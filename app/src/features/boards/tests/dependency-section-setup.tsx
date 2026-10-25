import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, userEvent } from '@testing-library/react-native';
import { AxiosError } from 'axios';
import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { DependencyTaskDto, TaskDependenciesDto } from '../api/critical-path.types';
import { dependenciesService } from '../api/dependencies.service';
import { tasksService } from '../api/tasks.service';
import { DependencySection } from '../components/task/DependencySection';
import { boardKeys } from '../queries/boards.keys';
import { makeData } from './fixtures';

/**
 * Dựng chung cho `DependencySection.test.tsx` — tách ra để file test giữ dưới trần 200 dòng của `check:file-size`.
 * File test tự khai `jest.mock` cho `fractional-indexing`, `dependencies.service`, `tasks.service` — `jest.mock` chỉ có
 * hiệu lực trong file khai nó, nhưng module mock được dùng chung với helper này (các tay cầm bên dưới trỏ vào bản mock).
 */
export const list = dependenciesService.list as jest.MockedFunction<
  typeof dependenciesService.list
>;
export const add = dependenciesService.add as jest.MockedFunction<typeof dependenciesService.add>;
export const remove = dependenciesService.remove as jest.MockedFunction<
  typeof dependenciesService.remove
>;
export const listTasks = tasksService.list as jest.MockedFunction<typeof tasksService.list>;

const METRICS = {
  frame: { height: 812, width: 375, x: 0, y: 0 },
  insets: { bottom: 34, left: 0, right: 0, top: 44 },
};

export function dep(
  id: string,
  title: string,
  overrides: Partial<DependencyTaskDto> = {},
): DependencyTaskDto {
  return {
    assignees: [],
    columnKind: 'IN_PROGRESS',
    dueDate: '2026-09-25T05:00:00.000Z',
    id,
    startDate: null,
    title,
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

export const LINKED: TaskDependenciesDto = {
  predecessors: [dep('t2', 'Thiết kế giao diện')],
  successors: [dep('d9', 'Kiểm thử', { columnKind: 'TODO' })],
};

export async function renderSection(canEdit = true) {
  const queryClient = new QueryClient({
    defaultOptions: {
      mutations: { gcTime: Infinity, retry: false },
      queries: { gcTime: Infinity, retry: false },
    },
  });
  // Bảng có sẵn trong cache: tiêu đề các thẻ trong vòng phụ thuộc được tra từ đây.
  queryClient.setQueryData(boardKeys.tasks('b1', {}), makeData());
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <SafeAreaProvider initialMetrics={METRICS}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </SafeAreaProvider>
  );
  const onOpenTask = jest.fn();
  const screen = await render(
    <DependencySection boardId="b1" canEdit={canEdit} taskId="t1" onOpenTask={onOpenTask} />,
    { wrapper: Wrapper },
  );
  return { onOpenTask, queryClient, screen };
}

/** "Thêm phụ thuộc" → chọn hướng trong tấm hành động (đóng tấm rồi mới mở tấm chọn thẻ, nên chờ hàng xuất hiện). */
export async function pickDirection(
  screen: Awaited<ReturnType<typeof renderSection>>['screen'],
  label: string,
) {
  await userEvent.press(screen.getByText('Thêm phụ thuộc'));
  await userEvent.press(await screen.findByText(label));
}
