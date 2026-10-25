import { cancelUpload } from '@/core/uploads/upload.runner';
import { useUploadStore } from '@/core/uploads/upload.store';
import type { UploadItem } from '@/core/uploads/upload.types';

import { taskUploadScopeKey } from './useTaskAttachmentUpload';

const IN_PROGRESS = new Set<UploadItem['status']>([
  'queued',
  'creating',
  'uploading',
  'paused',
  'processing',
]);

/**
 * Còn tệp của thẻ này đang tải (đính kèm thẻ HOẶC bình luận) không — để hỏi "Huỷ tải lên?" khi đóng màn
 * chi tiết (app.md §5). Tải nền vẫn chạy khi đóng: hàng đợi thuộc `core/uploads`, không thuộc màn hình.
 */
export function useTaskUploadGuard(taskId: string) {
  const items = useUploadStore((state) => state.items);
  const keys = [taskUploadScopeKey(taskId), `task-comment:${taskId}`];
  const busy = Object.values(items).filter(
    (item) =>
      item.scopeKey !== undefined && keys.includes(item.scopeKey) && IN_PROGRESS.has(item.status),
  );

  return {
    busyCount: busy.length,
    cancelAll: () => busy.forEach((item) => cancelUpload(item.localId)),
  };
}
