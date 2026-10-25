import { useCallback } from 'react';

import { newUploadLocalId } from '@/core/uploads/upload.local-id';
import { useUploadStore } from '@/core/uploads/upload.store';
import type { PickedFile } from '@/core/uploads/upload.types';

import { startResourceUploadFinalizer } from '../store/resource-upload-finalizer';
import { useResourceUploadStore } from '../store/resource-uploads.store';
import { planUploads, type UploadPlan } from '../utils/upload-plan';

/**
 * Nối upload manager của p0-05 (`core/uploads`) vào `POST /workspaces/:id/resources`
 * (app.md p3-01 §4 `useUploadToFolder(wsId, folderId)`).
 *
 * Mỗi tệp: ghi ĐÍCH (thư mục + `Idempotency-Key` sinh MỘT lần) rồi đẩy vào hàng
 * đợi chung với `scope: 'RESOURCE'`, `scopeKey`/`workspaceId` = workspace. Runner
 * chung lo tối đa 2 tệp song song, tạm dừng khi mất mạng, thử lại; khi asset
 * `READY`, `startResourceUploadFinalizer()` tạo Resource — không nằm trong hook
 * này để việc đó không phụ thuộc màn hình còn mở.
 *
 * ⚠️ Ghi ĐÍCH trước khi `addItem`: `addItem` bắn subscribe ngay và runner có thể
 * chạy tiếp, nhưng finalizer chỉ hành động khi `ready` — vẫn ghi đích trước cho chắc.
 */
export function useUploadToFolder(wsId: string, folderId: string | null) {
  const enqueue = useCallback(
    (files: readonly PickedFile[], remainingBytes?: number): UploadPlan => {
      const plan = planUploads(files, remainingBytes);
      if (plan.accepted.length === 0) return plan;

      startResourceUploadFinalizer();
      plan.accepted.forEach((file) => {
        const localId = newUploadLocalId();
        useResourceUploadStore.getState().setTarget(localId, {
          folderId,
          idempotencyKey: `rsc-${localId}`,
          phase: 'awaiting',
          workspaceId: wsId,
        });
        useUploadStore.getState().addItem({
          ...file,
          localId,
          progress: 0,
          scope: 'RESOURCE',
          scopeKey: wsId,
          status: 'queued',
          workspaceId: wsId,
        });
      });
      return plan;
    },
    [folderId, wsId],
  );

  return { enqueue };
}
