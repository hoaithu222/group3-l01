import { useQueryClient } from '@tanstack/react-query';

import type { TaskDependenciesDto } from '../api/critical-path.types';
import type { TaskDetailDto } from '../api/task-detail.types';
import { taskKeys } from '../queries/task-detail.keys';
import { findCardInBoardCaches } from '../utils/task-cache';

/**
 * Tra tiêu đề/người làm của thẻ KHÁC từ những gì ĐANG CÓ trong cache — cho chỗ mà BE chỉ trả id: vòng phụ thuộc
 * (`TASK_005 { cycle }`), activity `DEPENDENCY_*` (`{ predecessorId }`), `assigneeIds` của preview/Gantt.
 *
 * Đọc cache LÚC GỌI hàm (không đăng ký theo dõi): nơi dùng vẽ lại thường xuyên vì dữ liệu chính của nó là query, còn
 * bản tra này chỉ điền tên. Không có trong cache → `undefined`/rỗng, nơi gọi tự chọn câu rơi ("một thẻ khác").
 * ⛔ Không gọi mạng chỉ để lấy một tiêu đề: mỗi dòng activity sẽ thành một request.
 */
export function useTaskLookup(boardId: string, contextTaskId?: string) {
  const queryClient = useQueryClient();

  const titleOf = (taskId: string): string | undefined => {
    const card = findCardInBoardCaches(queryClient, boardId, taskId);
    if (card) return card.title;
    const detail = queryClient.getQueryData<TaskDetailDto>(taskKeys.detail(taskId));
    if (detail) return detail.title;
    const deps = contextTaskId
      ? queryClient.getQueryData<TaskDependenciesDto>(taskKeys.dependencies(contextTaskId))
      : undefined;
    return [...(deps?.predecessors ?? []), ...(deps?.successors ?? [])].find(
      (item) => item.id === taskId,
    )?.title;
  };

  /** "Lan, Minh" — tên các người làm CỦA thẻ đó mà cache biết; rỗng khi chưa có. Chỉ lấy người có trong `ids`. */
  const assigneesOf = (taskId: string, ids: readonly string[]): string => {
    const card = findCardInBoardCaches(queryClient, boardId, taskId);
    if (!card) return '';
    return card.assignees
      .filter((person) => ids.includes(person.id))
      .map((person) => person.name)
      .join(', ');
  };

  return { assigneesOf, titleOf };
}
