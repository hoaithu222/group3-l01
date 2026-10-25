import { apiClient } from '@/core/api/client';
import { unwrapData } from '@/core/api/unwrap';

import { taskChecklistItemPath, taskChecklistPath } from './task-detail.api';
import type { ChecklistResult } from './task-detail.types';

export interface ChecklistItemPatch {
  text?: string;
  done?: boolean;
  /** `null` = lên đầu; chuỗi = id mục đứng ngay TRƯỚC vị trí mới (be.md §3 `moveAfterItemId`). */
  moveAfterItemId?: string | null;
}

/**
 * Checklist theo TỪNG MỤC (be.md §4) — không cần `expectedVersion` (hai người tick hai mục khác
 * nhau không xung đột, PM2-21), nhưng mỗi lần vẫn tăng `Task.version` nên phản hồi mang `version` mới.
 *
 * `skipErrorToast`: optimistic ở tầng query, lỗi hiện MỘT toast do hook chọn (TASK_003 khác 404 mục).
 */
export const taskChecklistService = {
  async add(taskId: string, text: string, afterItemId?: string): Promise<ChecklistResult> {
    const response = await apiClient.post<ChecklistResult>(
      taskChecklistPath(taskId),
      { text, ...(afterItemId ? { afterItemId } : {}) },
      { skipErrorToast: true },
    );
    return unwrapData<ChecklistResult>(response);
  },

  async patch(taskId: string, itemId: string, payload: ChecklistItemPatch): Promise<ChecklistResult> {
    const response = await apiClient.patch<ChecklistResult>(
      taskChecklistItemPath(taskId, itemId),
      payload,
      { skipErrorToast: true },
    );
    return unwrapData<ChecklistResult>(response);
  },

  async remove(taskId: string, itemId: string): Promise<ChecklistResult> {
    const response = await apiClient.delete<ChecklistResult>(taskChecklistItemPath(taskId, itemId), {
      skipErrorToast: true,
    });
    return unwrapData<ChecklistResult>(response);
  },
};
