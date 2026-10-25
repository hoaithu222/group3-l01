import { useCallback, useMemo } from 'react';

import { newUploadLocalId } from './upload.local-id';
import { cancelUpload, retryUpload } from './upload.runner';
import { useUploadStore } from './upload.store';
import type { AssetScope, PickedFile, UploadItem } from './upload.types';

export interface UseUploadResult {
  items: UploadItem[];
  /** Thêm tệp mới vào hàng đợi — `upload.runner.ts` tự nhặt lên (subscribe store). */
  enqueue: (files: PickedFile[]) => void;
  cancel: (localId: string) => void;
  retry: (localId: string) => void;
}

/**
 * Hàng đợi upload của MỘT khung soạn tin/composer — app.md §2
 * "`useUpload(scope) → { enqueue(files), cancel, retry, items }`".
 *
 * `scopeKey` lọc thêm khi nhiều màn cùng `scope` (hai cuộc trò chuyện đều
 * `MESSAGE`) không được thấy tệp của nhau — xem `UploadItem.scopeKey`.
 */
export function useUpload(scope: AssetScope, scopeKey?: string): UseUploadResult {
  const allItems = useUploadStore((state) => state.items);
  const addItem = useUploadStore((state) => state.addItem);

  const items = useMemo(
    () =>
      Object.values(allItems).filter(
        (item) => item.scope === scope && (scopeKey === undefined || item.scopeKey === scopeKey),
      ),
    [allItems, scope, scopeKey],
  );

  const enqueue = useCallback(
    (files: PickedFile[]) => {
      files.forEach((file) => {
        addItem({
          localId: newUploadLocalId(),
          scope,
          scopeKey,
          kind: file.kind,
          uri: file.uri,
          name: file.name,
          mime: file.mime,
          size: file.size,
          durationMs: file.durationMs,
          waveform: file.waveform,
          width: file.width,
          height: file.height,
          status: 'queued',
          progress: 0,
        });
      });
    },
    [addItem, scope, scopeKey],
  );

  return { items, enqueue, cancel: cancelUpload, retry: retryUpload };
}
