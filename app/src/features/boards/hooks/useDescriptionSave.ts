import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { toErrorMessage } from '@/core/api/client.helpers';

import type { TaskDetailDto } from '../api/task-detail.types';
import { usePatchTask } from '../queries/task-detail.queries';
import { taskKeys } from '../queries/task-detail.keys';
import { getErrorCode } from '../utils/error-details';

/**
 * Lưu mô tả từ màn sửa toàn màn (app.md §3 DescriptionEditor). Khác lưu trường thường: `409 RES_003` không
 * chỉ báo — mô tả là văn bản DÀI người dùng vừa gõ, mất là mất công. Nên tải lại bản mới rồi hỏi: "Giữ bản
 * của tôi" (gửi lại với version MỚI, `mutationFn` đọc version từ cache đã làm tươi) hoặc "Dùng bản mới".
 * Mô tả rỗng gửi `null` (BE: `description: string | null`).
 */
export function useDescriptionSave(boardId: string, taskId: string) {
  const queryClient = useQueryClient();
  const patch = usePatchTask(boardId, taskId);
  const [conflict, setConflict] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** `true` khi đã lưu. */
  const submit = async (text: string): Promise<boolean> => {
    const description = text.trim() === '' ? null : text;
    setError(null);
    try {
      await patch.mutateAsync({ optimistic: { description }, patch: { description } });
      return true;
    } catch (failure) {
      if (getErrorCode(failure) === 'RES_003') {
        await queryClient.refetchQueries({ queryKey: taskKeys.detail(taskId) });
        setConflict(true);
      } else {
        setError(toErrorMessage(failure));
      }
      return false;
    }
  };

  return {
    conflict,
    error,
    saving: patch.isPending,
    dismissConflict: () => setConflict(false),
    /** Mô tả trên máy chủ SAU lần tải lại — nguồn của "Dùng bản mới". */
    remoteDescription: () =>
      queryClient.getQueryData<TaskDetailDto>(taskKeys.detail(taskId))?.description ?? '',
    submit,
  };
}
