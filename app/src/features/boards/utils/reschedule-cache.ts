import type { QueryClient } from '@tanstack/react-query';

import type { BoardTasksData, TaskCardDto } from '../api/boards.types';
import type { RescheduleAppliedItem } from '../api/critical-path.types';
import type { TaskDetailDto } from '../api/task-detail.types';
import { boardKeys } from '../queries/boards.keys';
import { taskKeys } from '../queries/task-detail.keys';
import { computeOverdue } from './apply-task-event';

/**
 * Ghi kết quả dời lịch (`200 { applied[] }`) vào cache: thẻ mini trong MỌI cache bảng và `detail` đang mở. Chỉ áp
 * khi `version` của phản hồi MỚI hơn bản đang có — sự kiện socket `task:updated` của chính lệnh này có thể tới trước
 * HTTP, ghi đè bằng bản cũ hơn sẽ làm thẻ "lùi" một nhịp rồi nhảy lại. Một lượt duyệt cache cho cả lô (≤ 200 thẻ):
 * gọi từng thẻ sẽ duyệt lại toàn bảng 200 lần.
 */
export function applyRescheduled(
  queryClient: QueryClient,
  boardId: string,
  applied: readonly RescheduleAppliedItem[],
  now: number = Date.now(),
): void {
  if (applied.length === 0) return;
  const byId = new Map(applied.map((item) => [item.taskId, item]));

  const patchCard = (card: TaskCardDto): TaskCardDto => {
    const item = byId.get(card.id);
    if (!item || card.version >= item.version) return card;
    return {
      ...card,
      dueDate: item.newDueDate,
      isOverdue: computeOverdue(item.newDueDate, card.columnKind, now),
      version: item.version,
    };
  };

  queryClient.setQueriesData<BoardTasksData>({ queryKey: boardKeys.tasksAll(boardId) }, (data) => {
    if (!data) return data;
    const columns: BoardTasksData['columns'] = {};
    for (const [columnId, tasks] of Object.entries(data.columns)) columns[columnId] = tasks.map(patchCard);
    return { ...data, columns };
  });

  for (const [taskId, item] of byId) {
    queryClient.setQueryData<TaskDetailDto>(taskKeys.detail(taskId), (detail) =>
      detail && detail.version < item.version
        ? { ...detail, ...patchCard(detail), startDate: item.newStartDate }
        : detail,
    );
  }
}
