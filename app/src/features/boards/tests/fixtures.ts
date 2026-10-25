import type {
  BoardColumn,
  BoardTasksData,
  TaskCardDto,
} from '../api/boards.types';

/** Thẻ mẫu — chỉ ghi đè trường cần cho ca kiểm. */
export function makeTask(overrides: Partial<TaskCardDto> & Pick<TaskCardDto, 'id'>): TaskCardDto {
  return {
    assignees: [],
    attachmentCount: 0,
    blockedByCount: 0,
    blockingCount: 0,
    boardId: 'b1',
    checklistDone: 0,
    checklistTotal: 0,
    columnId: 'c_todo',
    columnKind: 'TODO',
    commentCount: 0,
    completedAt: null,
    dueDate: null,
    isOverdue: false,
    labelIds: [],
    position: 'a0',
    reviewState: 'NONE',
    storyPoints: null,
    title: `Thẻ ${overrides.id}`,
    updatedAt: '2026-09-01T00:00:00.000Z',
    version: 1,
    ...overrides,
  };
}

export const COLUMNS: BoardColumn[] = [
  { id: 'c_todo', kind: 'TODO', order: 0, title: 'Cần làm', wipLimit: null },
  { id: 'c_doing', kind: 'IN_PROGRESS', order: 1, title: 'Đang làm', wipLimit: 2 },
  { id: 'c_done', kind: 'DONE', order: 2, title: 'Hoàn thành', wipLimit: null },
];

/** Cache mẫu: 3 thẻ ở cột "Cần làm" (a0 < a1 < a2), 1 ở "Đang làm", cột "Hoàn thành" rỗng. */
export function makeData(): BoardTasksData {
  return {
    columns: {
      c_doing: [makeTask({ columnId: 'c_doing', columnKind: 'IN_PROGRESS', id: 'd1', position: 'a0' })],
      c_done: [],
      c_todo: [
        makeTask({ id: 't1', position: 'a0' }),
        makeTask({ id: 't2', position: 'a1' }),
        makeTask({ id: 't3', position: 'a2' }),
      ],
    },
    hasMore: { c_doing: false, c_done: false, c_todo: false },
  };
}

export function ids(data: BoardTasksData, columnId: string): string[] {
  return (data.columns[columnId] ?? []).map((task) => task.id);
}
