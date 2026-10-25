import { useQueryClient } from '@tanstack/react-query';

import type { TaskDetailDto } from '../api/task-detail.types';
import { updateCardInBoardCaches } from '../utils/task-cache';
import { taskKeys } from './task-detail.keys';

/**
 * Đổi `commentCount` ±1 ở chi tiết VÀ thẻ mini trong cache bảng. `Task.commentCount` do BE giữ, nhưng
 * bình luận không chắc làm `version` của thẻ tăng nên `task:updated` có thể bị bỏ vì "không mới hơn" —
 * vá cục bộ để dòng "N bình luận" trên thẻ đúng ngay; số chuẩn của server sẽ ghi đè khi có `version` mới hơn.
 */
export function useBumpCommentCount(taskId: string): (delta: number) => void {
  const queryClient = useQueryClient();

  return (delta) => {
    const apply = (count: number) => Math.max(0, count + delta);
    const detail = queryClient.getQueryData<TaskDetailDto>(taskKeys.detail(taskId));
    if (!detail) return;
    queryClient.setQueryData<TaskDetailDto>(taskKeys.detail(taskId), {
      ...detail,
      commentCount: apply(detail.commentCount),
    });
    updateCardInBoardCaches(queryClient, detail.boardId, taskId, (card) => ({
      ...card,
      commentCount: apply(card.commentCount),
    }));
  };
}
