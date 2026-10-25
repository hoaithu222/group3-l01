import { isAxiosError } from 'axios';

import { getErrorCode } from '@/core/api';

import { clearTask, registerCancel } from './upload.active-tasks';
import { pollReady } from './upload.poll';
import { putApiMultipart, putPresigned } from './upload.transport';
import { uploadService } from './upload.service';
import { useUploadStore } from './upload.store';
import type { AssetDto } from './upload.types';

/**
 * Vòng đời MỘT item, từ `queued` tới `ready`/`failed`/`cancelled`/`paused` —
 * be.md §3 sequenceDiagram, app.md §4.
 *
 * ⛔ Tách khỏi `upload.runner.ts` (chỉ lo LỊCH — bao nhiêu song song, khi nào
 * chạy tiếp) để cả hai file dưới trần 150 dòng, giống `core/api/auth/` tách
 * `auth.service.ts` (điều phối) khỏi `session.service.ts` (một việc cụ thể).
 *
 * `isOnline` truyền vào thay vì đọc thẳng biến module của `upload.runner.ts`
 * để KHÔNG import ngược lại nó (vòng import hai file cùng cụm).
 */
export async function runItem(localId: string, isOnline: () => boolean): Promise<void> {
  const store = useUploadStore.getState();
  const item = store.items[localId];
  if (!item) return;

  store.updateItem(localId, { status: 'creating', progress: 0 });

  try {
    let assetId = item.assetId;
    /** `AssetDto` khi nội dung ĐÃ được BE chốt (API_PUT, hoặc asset còn lại từ lượt tải trước); `undefined` khi còn phải `complete` (PRESIGNED_PUT) hoặc đang tạm dừng. */
    let settled: AssetDto | undefined;
    if (!assetId) {
      const created = await uploadService.createAsset(
        {
          scope: item.scope,
          kind: item.kind,
          fileName: item.name,
          mime: item.mime,
          size: item.size,
          // Chỉ gửi khi có — scope MESSAGE… không khai `workspaceId` và BE không cần.
          ...(item.workspaceId ? { workspaceId: item.workspaceId } : {}),
        },
        localId,
      );
      assetId = created.asset.id;
      store.updateItem(localId, { assetId });
      settled = await putContent(localId, created.upload, item.mime, isOnline);
    } else {
      // Thử lại/tiếp tục sau khi tạm dừng: lượt trước có thể ĐÃ tải xong mà mất phản hồi — asset khi đó không còn
      // `UPLOADING` nên xin URL mới sẽ bị 403 `ASSET_004`; chỉ tải lại khi BE còn đang chờ nội dung.
      const existing = await uploadService.getAssetById(assetId);
      if (existing.status === 'UPLOADING') {
        const instruction = await uploadService.reissueUploadUrl(assetId);
        settled = await putContent(localId, instruction, item.mime, isOnline);
      } else {
        settled = existing;
      }
    }

    if (useUploadStore.getState().items[localId]?.status === 'paused') return;

    const current = useUploadStore.getState().items[localId];
    if (!current) return;
    store.updateItem(localId, { status: 'processing', progress: 100 });
    const completed =
      settled ??
      (await uploadService.completeAsset(assetId, {
        size: current.size,
        durationMs: current.durationMs,
        width: current.width,
        height: current.height,
        waveform: current.waveform,
      }));

    const finalAsset =
      completed.status === 'READY' || completed.status === 'REJECTED'
        ? completed
        : await pollReady(assetId);

    if (finalAsset.status === 'READY') {
      store.updateItem(localId, { status: 'ready', progress: 100 });
    } else {
      store.updateItem(localId, { status: 'failed', errorCode: finalAsset.rejectReason ?? 'ASSET_TIMEOUT' });
    }
  } catch (err) {
    clearTask(localId);
    // Huỷ CHỦ ĐỘNG đã đặt `cancelled` NGAY trong `cancelUpload()` (đồng bộ,
    // trước khi promise của tác vụ native kịp reject) — đọc lại status thay vì
    // đoán qua nội dung lỗi để không lẫn với một lỗi mạng trùng thời điểm.
    if (useUploadStore.getState().items[localId]?.status === 'cancelled') return;
    if (!isOnline()) {
      store.updateItem(localId, { status: 'paused' });
      return;
    }
    const errorCode = isAxiosError(err) ? getErrorCode(err) : 'UNKNOWN';
    store.updateItem(localId, { status: 'failed', errorCode });
  }
}

/**
 * Tải nội dung lên. Trả `AssetDto` chỉ với `API_PUT` (BE đã chốt asset ngay trong `PUT /content`); `PRESIGNED_PUT` tải thẳng
 * lên storage nên trả `undefined` — nơi gọi còn phải `complete`. Cũng trả `undefined` khi offline (item chuyển `paused`).
 */
async function putContent(
  localId: string,
  instruction: Awaited<ReturnType<typeof uploadService.reissueUploadUrl>>,
  mime: string,
  isOnline: () => boolean,
): Promise<AssetDto | undefined> {
  if (!isOnline()) {
    useUploadStore.getState().updateItem(localId, { status: 'paused' });
    return undefined;
  }
  useUploadStore.getState().updateItem(localId, { status: 'uploading' });

  const item = useUploadStore.getState().items[localId];
  if (!item) return undefined;
  const onProgress = (progress: number) => useUploadStore.getState().updateItem(localId, { progress });

  if (instruction.method === 'PRESIGNED_PUT') {
    const upload = putPresigned(instruction.url, instruction.headers, { ...item, mime }, onProgress);
    registerCancel(localId, upload.cancel);
    await upload.promise;
    clearTask(localId);
    return undefined;
  }

  const upload = putApiMultipart(item.assetId as string, { ...item, mime }, onProgress);
  registerCancel(localId, upload.cancel);
  const asset = await upload.promise;
  clearTask(localId);
  return asset;
}
