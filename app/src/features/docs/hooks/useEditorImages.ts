import { useCallback, useEffect, useRef } from 'react';

import { pickImages } from '@/core/media/pick-media';
import { validateFile } from '@/core/uploads/mime';
import { newUploadLocalId } from '@/core/uploads/upload.local-id';
import { useUploadStore } from '@/core/uploads/upload.store';
import { showToast } from '@/shared/utils/toast.utils';

import { docsCollabService } from '../api/docs-collab.service';
import { docsErrorMessage } from '../utils/docs-errors';
import { type DocEditorBridge, hostMessage } from '../webview/doc-editor-bridge';

const ACTIVE_STATUSES = new Set(['queued', 'creating', 'uploading', 'paused', 'processing']);

export interface UseEditorImagesOptions {
  bridge: DocEditorBridge;
  docId: string;
  wsId: string;
}

/**
 * Chèn ảnh (app.md §4): chọn ảnh → upload qua hàng đợi CHUNG (`core/uploads`, scope `DOC`, kèm `workspaceId` để BE kiểm hạn mức) → khi
 * READY thì `POST /documents/:id/assets` (gắn `AssetLink` để MỌI người đọc tài liệu lấy được URL ký) → gửi `insertImage { assetId }` cho editor.
 * Nội dung Yjs chỉ lưu `assetId`, ⛔ không bao giờ lưu URL. Mỗi lượt upload xử lý ĐÚNG MỘT lần (`handled`), thành công hay lỗi đều dọn khỏi hàng đợi.
 */
export function useEditorImages({ bridge, docId, wsId }: UseEditorImagesOptions) {
  const items = useUploadStore((state) => state.items);
  const handled = useRef(new Set<string>());

  const pick = useCallback(async () => {
    let file;
    try {
      [file] = await pickImages({ allowsMultipleSelection: false, selectionLimit: 1 });
    } catch {
      showToast('error', 'Không mở được thư viện ảnh.');
      return;
    }
    if (!file) return;
    const check = validateFile({ kind: 'IMAGE', mime: file.mime, size: file.size });
    if (!check.ok) {
      showToast('error', check.message);
      return;
    }
    useUploadStore.getState().addItem({
      height: file.height,
      kind: 'IMAGE',
      localId: newUploadLocalId(),
      mime: file.mime,
      name: file.name,
      progress: 0,
      scope: 'DOC',
      scopeKey: docId,
      size: file.size,
      status: 'queued',
      uri: file.uri,
      width: file.width,
      workspaceId: wsId,
    });
  }, [docId, wsId]);

  useEffect(() => {
    for (const item of Object.values(items)) {
      if (item.scope !== 'DOC' || item.scopeKey !== docId || handled.current.has(item.localId))
        continue;
      if (item.status === 'failed' || item.status === 'cancelled') {
        handled.current.add(item.localId);
        if (item.status === 'failed') showToast('error', 'Không tải được ảnh lên. Thử lại sau.');
        useUploadStore.getState().removeItem(item.localId);
      } else if (item.status === 'ready' && item.assetId) {
        handled.current.add(item.localId);
        const { assetId, localId } = item;
        docsCollabService.attachAsset(docId, assetId).then(
          () => bridge.send(hostMessage('insertImage', { assetId })),
          (error: unknown) => showToast('error', docsErrorMessage(error)),
        );
        useUploadStore.getState().removeItem(localId);
      }
    }
  }, [bridge, docId, items]);

  const uploading = Object.values(items).some(
    (item) => item.scope === 'DOC' && item.scopeKey === docId && ACTIVE_STATUSES.has(item.status),
  );
  return { pick, uploading };
}
