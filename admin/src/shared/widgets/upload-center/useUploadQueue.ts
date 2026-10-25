/**
 * useUploadQueue — view-model của `upload-queue.store`.
 *
 * Hook CHỈ đọc store + tổng hợp vài con số cho panel; điều phối thật do runner
 * trong store lo (nằm ngoài React). Nhờ vậy mount hook ở nhiều component cùng
 * lúc vẫn an toàn — không có `useEffect` nào khởi động thêm một vòng chạy thứ hai.
 */

import { useMemo } from 'react';

import type { UploadFile } from '@/shared/ui';

import { useUploadQueueStore } from './upload-queue.store';

export interface UploadQueueSummary {
  total: number;
  done: number;
  failed: number;
  /** Task đang chạy (nếu có) — panel lấy tên tệp + % từ đây. */
  active?: UploadFile;
  /** Xong SẠCH: có task và không còn task nào lỗi/đang chạy. */
  allDone: boolean;
}

export interface UseUploadQueueReturn {
  tasks: UploadFile[];
  enqueue: ReturnType<typeof useUploadQueueStore.getState>['enqueue'];
  retry: () => void;
  clear: () => void;
  cancel: () => void;
  summary: UploadQueueSummary;
}

export function useUploadQueue(): UseUploadQueueReturn {
  const tasks = useUploadQueueStore((s) => s.tasks);
  const enqueue = useUploadQueueStore((s) => s.enqueue);
  const retry = useUploadQueueStore((s) => s.retryFailed);
  const clear = useUploadQueueStore((s) => s.clear);
  const cancel = useUploadQueueStore((s) => s.cancel);

  const summary = useMemo<UploadQueueSummary>(() => {
    const total = tasks.length;
    const done = tasks.filter((t) => t.status === 'success').length;
    const failed = tasks.filter((t) => t.status === 'error').length;
    const active = tasks.find((t) => t.status === 'uploading' || t.status === 'pending');
    return { total, done, failed, active, allDone: total > 0 && done === total };
  }, [tasks]);

  return { tasks, enqueue, retry, clear, cancel, summary };
}
