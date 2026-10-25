import { queryClient } from '@/core/config/query-client';
import { useUploadStore } from '@/core/uploads/upload.store';

import { resourcesService } from '../api';
import { insertCreatedResource } from '../queries/resource-cache';
import { extractErrorCode } from '../utils/error-messages';
import { useResourceUploadStore } from './resource-uploads.store';

let started = false;

/**
 * Với mỗi tệp RESOURCE mà asset đã `READY` và CHƯA thêm vào kho → `POST
 * /workspaces/:id/resources` đúng thư mục đã ghi lúc xếp hàng.
 *
 * ⚠️ Singleton NGOÀI React (giống `upload.runner.ts`), KHÔNG phải effect của màn
 * hình: người dùng rời thư mục — thậm chí rời tab Tài liệu — trong lúc tải, tệp
 * vẫn phải được thêm vào kho khi xong. Gắn vào vòng đời màn hình là tệp "tải
 * xong mà không thấy đâu".
 *
 * Chống gọi đôi: `phase` chuyển `awaiting → creating` ĐỒNG BỘ (Zustand gọi
 * listener ngay) trước khi `await`, nên lượt `scan()` lồng bên trong không nhặt
 * lại cùng tệp; `Idempotency-Key` cố định/tệp bảo đảm thử lại không tạo bản hai.
 */
async function finalize(localId: string): Promise<void> {
  const targets = useResourceUploadStore.getState();
  const target = targets.targets[localId];
  const item = useUploadStore.getState().items[localId];
  if (!target || !item?.assetId) return;

  targets.patchTarget(localId, { phase: 'creating', errorCode: undefined });
  try {
    const resource = await resourcesService.create(
      target.workspaceId,
      { assetId: item.assetId, ...(target.folderId ? { folderId: target.folderId } : {}) },
      target.idempotencyKey,
    );
    insertCreatedResource(queryClient, target.workspaceId, resource);
    useResourceUploadStore
      .getState()
      .patchTarget(localId, { phase: 'created', resourceId: resource.id });
  } catch (error) {
    useResourceUploadStore
      .getState()
      .patchTarget(localId, { phase: 'failed', errorCode: extractErrorCode(error) ?? 'UNKNOWN' });
  }
}

function scan(): void {
  const uploads = useUploadStore.getState().items;
  Object.entries(useResourceUploadStore.getState().targets).forEach(([localId, target]) => {
    if (target.phase === 'awaiting' && uploads[localId]?.status === 'ready') void finalize(localId);
  });
}

/** Idempotent — gọi ở mọi lần xếp hàng, chỉ đăng ký listener một lần. */
export function startResourceUploadFinalizer(): void {
  if (started) return;
  started = true;
  useUploadStore.subscribe(scan);
  useResourceUploadStore.subscribe(scan);
  scan();
}

/** Thử lại CHỈ bước `POST /resources` (asset đã `READY`, không tải lại tệp). */
export function retryFinalize(localId: string): void {
  useResourceUploadStore
    .getState()
    .patchTarget(localId, { phase: 'awaiting', errorCode: undefined });
}
