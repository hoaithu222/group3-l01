/**
 * Adapter nối hàng đợi tải lên chung (`shared/widgets/upload-center`) với `/assets` của BE
 * (p0-05). Ba bước: `POST /assets` → tải nội dung → (chốt) → chờ `READY`.
 *
 *   PRESIGNED_PUT (S3):  POST /assets → XHR PUT lên storage → POST /assets/:id/complete → poll GET /assets/:id
 *   API_PUT (Local/…):   POST /assets → PUT /assets/:id/content (multipart) ────────────→ poll GET /assets/:id
 *
 * Lệch `admin.md` §2.2 (chỗ "complete" chung cho cả hai): với `API_PUT`, BE tự chốt ngay trong
 * `PUT /content` (`uploadContent()` → `finalize()`); gọi thêm `/complete` sẽ ăn `ASSET_004` (asset đã
 * `PROCESSING`/`READY`, không còn `UPLOADING`). Nên `API_PUT` bỏ bước `complete`.
 *
 * Dùng:
 *   const { enqueue } = useUploadQueue();
 *   enqueue([file], createAssetUploader({ scope: 'AVATAR' }));   // task.assetId có sau khi BE đăng ký
 */
import { apiClient } from '@/core/api/client';
import type { RequestConfig } from '@/core/api/client.types';
import type { UploadHandler } from '@/shared/ui';
import type { ApiResponse } from '@/shared/types/api.types';

import { abortError, putApiContent, putPresigned, sleep } from './asset-upload.transport';
import {
  AssetUploadError,
  type AssetDto,
  type AssetKind,
  type CreateAssetPayload,
  type PresignedPutInstruction,
  type UploadAssetOptions,
  type UploadInstruction,
} from './asset-upload.types';

export * from './asset-upload.types';

/** Phần thanh tiến độ dành cho việc tải nội dung; phần còn lại là chốt (95) + chờ xử lý — không kẹt ở "100%" khi BE còn xử lý. */
const PUT_SHARE = 90;
const AFTER_COMPLETE = 95;
const DEFAULT_POLL_TIMEOUT_MS = 30_000;
const DEFAULT_POLL_BACKOFF_MS = [500, 1000, 2000, 3000] as const;

/** Suy `kind` từ MIME — `VOICE` không suy được (cùng MIME với `AUDIO`), phải khai tường minh. */
export function assetKindFromMime(mime: string): AssetKind {
  const m = mime.toLowerCase();
  if (m.startsWith('image/')) return 'IMAGE';
  if (m.startsWith('video/')) return 'VIDEO';
  if (m.startsWith('audio/')) return 'AUDIO';
  return 'FILE';
}

const newKey = (): string =>
  globalThis.crypto?.randomUUID?.() ??
  `asset_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

async function createAsset(
  payload: CreateAssetPayload,
  idempotencyKey: string,
  signal?: AbortSignal,
): Promise<{ asset: AssetDto; upload: UploadInstruction }> {
  const res = await apiClient.post<ApiResponse<{ asset: AssetDto; upload: UploadInstruction }>>(
    '/assets',
    payload,
    {
      headers: { 'Idempotency-Key': idempotencyKey },
      signal,
    },
  );
  return res.data.data;
}

async function completeAsset(
  assetId: string,
  size: number,
  signal?: AbortSignal,
): Promise<AssetDto> {
  const res = await apiClient.post<ApiResponse<AssetDto>>(
    `/assets/${assetId}/complete`,
    { size },
    { signal },
  );
  return res.data.data;
}

/** Không toast: poll lỗi mạng thoáng qua không đáng làm phiền, lỗi cuối cùng do luồng chính báo. */
async function getAsset(assetId: string, signal?: AbortSignal): Promise<AssetDto> {
  const res = await apiClient.get<ApiResponse<AssetDto>>(`/assets/${assetId}`, {
    signal,
    skipErrorToast: true,
  } as RequestConfig);
  return res.data.data;
}

/** URL ký hết hạn (hoặc `POST /assets` bị replay theo Idempotency-Key trả lại URL cũ) → xin chỉ dẫn mới, KHÔNG tạo asset mới. */
async function reissueUploadUrl(assetId: string, signal?: AbortSignal): Promise<UploadInstruction> {
  const res = await apiClient.post<ApiResponse<UploadInstruction>>(
    `/assets/${assetId}/upload-url`,
    undefined,
    {
      signal,
    },
  );
  return res.data.data;
}

/** Best-effort — asset đã qua `UPLOADING` thì BE trả 403 `ASSET_004`; bỏ qua mọi lỗi. */
async function abortAsset(assetId: string): Promise<void> {
  await apiClient
    .post(`/assets/${assetId}/abort`, undefined, { skipErrorToast: true } as RequestConfig)
    .catch(() => undefined);
}

/** Chờ `PROCESSING` → `READY`/`REJECTED` (be.md §3: BE cố ý KHÔNG bắn socket cho asset — client poll). */
async function pollReady(assetId: string, options: UploadAssetOptions): Promise<AssetDto> {
  const {
    pollTimeoutMs = DEFAULT_POLL_TIMEOUT_MS,
    pollBackoffMs = DEFAULT_POLL_BACKOFF_MS,
    signal,
  } = options;
  const startedAt = Date.now();
  let asset = await getAsset(assetId, signal);
  for (let step = 0; asset.status === 'PROCESSING'; step += 1) {
    if (Date.now() - startedAt >= pollTimeoutMs) {
      throw new AssetUploadError(
        'ASSET_TIMEOUT',
        'Tệp đang được xử lý quá lâu, hãy thử lại sau ít phút',
      );
    }
    await sleep(pollBackoffMs[Math.min(step, pollBackoffMs.length - 1)] ?? 3000, signal);
    asset = await getAsset(assetId, signal);
  }
  return asset;
}

/** Tải nội dung lên storage; URL ký hết hạn (403) → cấp lại chỉ dẫn và thử đúng MỘT lần nữa. */
async function putPresignedWithRetry(
  assetId: string,
  first: PresignedPutInstruction,
  file: File,
  options: UploadAssetOptions,
): Promise<void> {
  const put = (i: PresignedPutInstruction) =>
    putPresigned(i, file, {
      signal: options.signal,
      createXhr: options.createXhr,
      onProgress: (p) => options.onProgress?.(Math.round((p * PUT_SHARE) / 100)),
    });
  try {
    await put(first);
  } catch (err) {
    if (!(err instanceof AssetUploadError) || err.status !== 403) throw err;
    const fresh = await reissueUploadUrl(assetId, options.signal);
    if (fresh.method !== 'PRESIGNED_PUT') throw err;
    await put(fresh);
  }
}

/**
 * Tải MỘT tệp lên `/assets` và trả `AssetDto` ở trạng thái `READY`.
 * Ném `AssetUploadError` khi tệp bị từ chối/hết giờ chờ xử lý; lỗi HTTP của `/assets` là lỗi axios (đã toast).
 * Huỷ (`signal`) → dừng ngay, báo BE `abort` (best-effort) rồi ném `AbortError`.
 */
export async function uploadAsset(file: File, options: UploadAssetOptions): Promise<AssetDto> {
  const { scope, workspaceId, signal, onProgress, onAssetId } = options;
  if (signal?.aborted) throw abortError();
  // BE bắt buộc MIME thuộc allowlist và size > 0 — chặn sớm thay vì tốn một round-trip ăn 400 `VAL_001`.
  if (!file.type || file.size <= 0) {
    throw new AssetUploadError('ASSET_001', 'Tệp rỗng hoặc không xác định được định dạng');
  }

  const { asset, upload } = await createAsset(
    {
      scope,
      kind: options.kind ?? assetKindFromMime(file.type),
      fileName: file.name,
      mime: file.type,
      size: file.size,
      ...(workspaceId && { workspaceId }),
    },
    options.idempotencyKey ?? newKey(),
    signal,
  );
  onAssetId?.(asset.id);

  try {
    let current: AssetDto;
    if (upload.method === 'PRESIGNED_PUT') {
      await putPresignedWithRetry(asset.id, upload, file, options);
      onProgress?.(PUT_SHARE);
      current = await completeAsset(asset.id, file.size, signal);
    } else {
      current = await putApiContent(asset.id, file, {
        signal,
        onProgress: (p) => onProgress?.(Math.round((p * PUT_SHARE) / 100)),
      });
    }
    onProgress?.(AFTER_COMPLETE);

    if (current.status === 'PROCESSING') current = await pollReady(asset.id, options);
    if (current.status !== 'READY') {
      throw new AssetUploadError(
        'ASSET_REJECTED',
        current.rejectReason ?? 'Tệp bị từ chối, không thể sử dụng',
      );
    }
    return current;
  } catch (err) {
    if (signal?.aborted) await abortAsset(asset.id);
    throw err;
  }
}

/**
 * `UploadHandler` cho `useUploadQueue().enqueue(files, handler)` (và `FileField`/`useUpload` của kit2).
 * Trả về **id asset** (KHÔNG phải URL: URL tải có chữ ký hết hạn ≤ 60 s, xin bằng `GET /assets/:id/url`
 * khi cần hiển thị). Hàng đợi truyền `id` task làm `Idempotency-Key` (ổn định qua "Thử lại") và nhận
 * `onAssetId` để ghi `UploadFile.assetId`.
 */
export function createAssetUploader(
  options: Pick<UploadAssetOptions, 'scope' | 'kind' | 'workspaceId'> &
    Partial<Pick<UploadAssetOptions, 'pollTimeoutMs' | 'pollBackoffMs' | 'createXhr'>>,
): UploadHandler {
  return async (file, { onProgress, signal, id, onAssetId }) => {
    const asset = await uploadAsset(file, {
      ...options,
      onProgress,
      signal,
      onAssetId,
      idempotencyKey: id,
    });
    return asset.id;
  };
}
