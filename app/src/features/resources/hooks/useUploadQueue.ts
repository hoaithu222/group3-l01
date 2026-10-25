import { useCallback, useMemo } from 'react';

import { cancelUpload, retryUpload } from '@/core/uploads/upload.runner';
import { useUploadStore } from '@/core/uploads/upload.store';

import { retryFinalize } from '../store/resource-upload-finalizer';
import { useResourceUploadStore } from '../store/resource-uploads.store';
import {
  buildQueueRows,
  summarizeQueue,
  type QueueRow,
  type QueueSummary,
} from '../utils/upload-queue';

function dismissOne(localId: string): void {
  useUploadStore.getState().removeItem(localId);
  useResourceUploadStore.getState().removeTarget(localId);
}

/**
 * Hàng đợi tải lên của MỘT workspace (lọc `scope: RESOURCE` + `scopeKey = wsId`)
 * dưới dạng dòng hiển thị + hành động. Trạng thái tải do `core/uploads` giữ;
 * hook chỉ gộp thêm bước "thêm vào kho" (`resource-uploads.store`).
 */
export function useUploadQueue(wsId: string): {
  cancel: (localId: string) => void;
  clearFinished: () => void;
  dismiss: (localId: string) => void;
  retry: (row: QueueRow) => void;
  rows: QueueRow[];
  summary: QueueSummary;
} {
  const items = useUploadStore((state) => state.items);
  const targets = useResourceUploadStore((state) => state.targets);

  const rows = useMemo(
    () =>
      buildQueueRows(
        Object.values(items).filter((item) => item.scope === 'RESOURCE' && item.scopeKey === wsId),
        targets,
      ),
    [items, targets, wsId],
  );
  const summary = useMemo(() => summarizeQueue(rows), [rows]);

  const retry = useCallback((row: QueueRow) => {
    if (row.retry === 'finalize') retryFinalize(row.localId);
    else if (row.retry === 'upload') retryUpload(row.localId);
  }, []);

  const clearFinished = useCallback(() => {
    rows
      .filter((row) => row.state === 'done' || row.state === 'cancelled')
      .forEach((row) => dismissOne(row.localId));
  }, [rows]);

  return { cancel: cancelUpload, clearFinished, dismiss: dismissOne, retry, rows, summary };
}
