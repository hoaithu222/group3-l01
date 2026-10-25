import { apiClient } from '@/core/api/client';
import { unwrapData } from '@/core/api/unwrap';

import { taskAttachmentPath, taskAttachmentsPath } from './task-detail.api';
import type { AttachmentDto, AttachResult } from './task-detail.types';

/** Đính kèm thẻ qua `AssetLink { targetType: TASK }` (be.md §4) — asset đã `READY` từ `core/uploads`. */
export const taskAttachmentsService = {
  async list(taskId: string): Promise<AttachmentDto[]> {
    const response = await apiClient.get<AttachmentDto[]>(taskAttachmentsPath(taskId));
    return unwrapData<AttachmentDto[]>(response);
  },

  /** `TASK_004` (asset chưa READY/không phải của mình/đã gắn) và `TASK_012` (quá 10): hook tự báo toast. */
  async attach(taskId: string, assetId: string): Promise<AttachResult> {
    const response = await apiClient.post<AttachResult>(
      taskAttachmentsPath(taskId),
      { assetId },
      { skipErrorToast: true },
    );
    return unwrapData<AttachResult>(response);
  },

  async detach(taskId: string, assetId: string): Promise<void> {
    await apiClient.delete(taskAttachmentPath(taskId, assetId));
  },
};
