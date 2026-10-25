import type { QueryClient } from '@tanstack/react-query';

import type { BoardTasksData, ColumnKind, TaskCardDto } from '../api/boards.types';
import type { TaskDetailDto } from '../api/task-detail.types';
import { boardKeys } from '../queries/boards.keys';
import { taskKeys } from '../queries/task-detail.keys';
import { updateCardInData } from './task-cache';

/** Hai đầu của một cạnh `predecessor → successor` cùng loại cột hiện tại (quyết định có tính vào bộ đếm không). */
export interface DependencyEnds {
  predecessor: { columnKind: ColumnKind; id: string };
  successor: { columnKind: ColumnKind; id: string };
}

const bump = (value: number, delta: 1 | -1): number => Math.max(0, value + delta);

/**
 * Cập nhật CỤC BỘ hai bộ đếm sau khi thêm (`+1`)/gỡ (`-1`) cạnh — cùng quy tắc BE (be.md §5.1): chỉ tính thẻ ĐỐI
 * DIỆN chưa `DONE` (thẻ trước đã xong không còn chặn ai; thẻ sau đã xong không còn bị chặn). Đây chỉ là bản hiện ngay:
 * số CHUẨN và `version` mới của hai thẻ tới qua `task:updated` (`changed: ['dependencies']`) và lần tải lại sau đó.
 */
export function adjustCounts(
  card: TaskCardDto,
  role: 'predecessor' | 'successor',
  otherKind: ColumnKind,
  delta: 1 | -1,
): TaskCardDto {
  if (otherKind === 'DONE') return card;
  return role === 'successor'
    ? { ...card, blockedByCount: bump(card.blockedByCount, delta) }
    : { ...card, blockingCount: bump(card.blockingCount, delta) };
}

/** Áp `adjustCounts` lên thẻ mini trong MỌI cache bảng và lên `detail` của hai thẻ (nếu đang có trong cache). */
export function applyDependencyDelta(
  queryClient: QueryClient,
  boardId: string,
  ends: DependencyEnds,
  delta: 1 | -1,
): void {
  const { predecessor, successor } = ends;
  const edit = (id: string, role: 'predecessor' | 'successor', otherKind: ColumnKind) => ({
    id,
    update: (card: TaskCardDto) => adjustCounts(card, role, otherKind, delta),
  });
  const edits = [
    edit(successor.id, 'successor', predecessor.columnKind),
    edit(predecessor.id, 'predecessor', successor.columnKind),
  ];

  queryClient.setQueriesData<BoardTasksData>({ queryKey: boardKeys.tasksAll(boardId) }, (data) =>
    data ? edits.reduce((next, item) => updateCardInData(next, item.id, item.update), data) : data,
  );
  for (const item of edits) {
    queryClient.setQueryData<TaskDetailDto>(taskKeys.detail(item.id), (detail) =>
      detail ? { ...detail, ...item.update(detail) } : detail,
    );
  }
}
