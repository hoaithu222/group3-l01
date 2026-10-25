import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { toErrorMessage } from '@/core/api/client.helpers';
import { useUploadStore } from '@/core/uploads/upload.store';
import { useUpload } from '@/core/uploads/use-upload';
import type { PickedFile } from '@/core/uploads/upload.types';
import { showToast } from '@/shared/utils/toast.utils';

import { taskAttachmentsService } from '../api/task-attachments.service';
import { FALLBACK_TASK_LIMITS } from '../constants/task-detail.constants';
import { applyAttachResult } from '../queries/task-attachments.queries';
import { getErrorCode } from '../utils/error-details';

/** Khoá phạm vi hàng đợi upload của MỘT thẻ — `useUpload('TASK', …)` chỉ thấy tệp của thẻ đó. */
export const taskUploadScopeKey = (taskId: string): string => `task:${taskId}`;
const TASK_KEY_PREFIX = 'task:';

/**
 * Hàng đợi upload đính kèm THẺ (`scope: 'TASK'`, app.md §4 "Đính kèm"): chỉ thêm tệp vào hàng đợi
 * chung của p0-05 (tối đa 2 tệp song song, tự tạm dừng khi mất mạng). Việc `POST /tasks/:id/attachments`
 * khi tệp `READY` do `useTaskAttachmentFinalizer` lo — không nằm ở đây để đóng màn chi tiết giữa chừng
 * không làm tệp "tải xong mà không thấy đâu".
 */
export function useTaskAttachmentUpload(taskId: string, attachedCount: number) {
  const { items, enqueue, cancel, retry } = useUpload('TASK', taskUploadScopeKey(taskId));
  const remaining = Math.max(0, FALLBACK_TASK_LIMITS.attachmentsMax - attachedCount - items.length);

  const addFiles = (files: PickedFile[]) => {
    if (files.length === 0) return;
    if (files.length > remaining) {
      showToast('warning', `Mỗi thẻ tối đa ${FALLBACK_TASK_LIMITS.attachmentsMax} tệp đính kèm`);
    }
    enqueue(files.slice(0, remaining));
  };

  return {
    addFiles,
    cancel,
    items,
    remaining,
    remove: (localId: string) => useUploadStore.getState().removeItem(localId),
    retry,
  };
}

/**
 * Với mỗi tệp `TASK` đã `READY` mà CHƯA gắn vào thẻ → `POST /tasks/:id/attachments`, rồi gỡ khỏi hàng đợi.
 * Gắn ở `BoardScopeProvider` (sống suốt lúc còn trong bảng) chứ không ở màn chi tiết. Lỗi (quá 10 tệp
 * `TASK_012`, asset không hợp lệ `TASK_004`) → tệp thành `failed` để người dùng thấy và huỷ.
 */
export function useTaskAttachmentFinalizer(boardId: string): void {
  const queryClient = useQueryClient();
  const items = useUploadStore((state) => state.items);
  const inFlight = useRef(new Set<string>());

  useEffect(() => {
    Object.values(items).forEach((item) => {
      const scopeKey = item.scopeKey ?? '';
      if (item.scope !== 'TASK' || item.status !== 'ready' || !item.assetId) return;
      if (!scopeKey.startsWith(TASK_KEY_PREFIX) || inFlight.current.has(item.localId)) return;

      const taskId = scopeKey.slice(TASK_KEY_PREFIX.length);
      const assetId = item.assetId;
      inFlight.current.add(item.localId);
      taskAttachmentsService
        .attach(taskId, assetId)
        .then((result) => {
          applyAttachResult(queryClient, boardId, taskId, result);
          useUploadStore.getState().removeItem(item.localId);
        })
        .catch((error: unknown) => {
          useUploadStore
            .getState()
            .updateItem(item.localId, {
              errorCode: getErrorCode(error) ?? 'UNKNOWN',
              status: 'failed',
            });
          showToast('error', toErrorMessage(error));
        })
        .finally(() => inFlight.current.delete(item.localId));
    });
  }, [boardId, items, queryClient]);
}
