import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { GanttDto, GanttTaskDto } from '../api/critical-path.types';
import { useGanttBoard } from '../hooks/useGanttBoard';

/** Dựng chung cho `GanttScreen*.test.tsx` — mỗi file test tự khai `jest.mock` (chỉ có hiệu lực trong file khai nó). */
const mockedView = useGanttBoard as jest.MockedFunction<typeof useGanttBoard>;

const METRICS = {
  frame: { height: 812, width: 375, x: 0, y: 0 },
  insets: { bottom: 34, left: 0, right: 0, top: 44 },
};
export const Wrapper = ({ children }: { children: ReactNode }) => (
  <SafeAreaProvider initialMetrics={METRICS}>{children}</SafeAreaProvider>
);

export const selectRange = jest.fn();
export const toggleListView = jest.fn();
export const refetch = jest.fn();
const dismissBatch = jest.fn();

export const DEVICE_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;

const TASK: GanttTaskDto = {
  assigneeIds: [],
  blockedByCount: 0,
  columnKind: 'TODO',
  conflict: false,
  dueDate: '2026-09-25T05:00:00.000Z',
  id: 't1',
  isCritical: false,
  slackDays: null,
  startDate: null,
  title: 'Viết báo cáo',
};

export function dto(overrides: Partial<GanttDto> = {}): GanttDto {
  return { edges: [], from: '2026-09-01T00:00:00.000Z', tasks: [TASK], timezone: DEVICE_TZ, to: '2026-09-30T00:00:00.000Z', truncated: false, ...overrides };
}

export function mockView(overrides: Record<string, unknown> = {}, data: GanttDto | undefined = dto()) {
  mockedView.mockReturnValue({
    activeBatchId: null,
    archived: false,
    board: { data: { name: 'Đồ án' } },
    canMove: true,
    dismissBatch,
    featureOff: false,
    gantt: { data, error: null, isError: false, refetch },
    listView: false,
    offline: false,
    rangeKey: 'month',
    selectRange,
    showChart: true,
    tablet: true,
    toggleListView,
    ...overrides,
  } as never);
}
