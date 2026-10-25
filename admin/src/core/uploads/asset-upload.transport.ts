import { apiClient } from '@/core/api/client';
import type { ApiResponse } from '@/shared/types/api.types';

import {
  AssetUploadError,
  type AssetDto,
  type PresignedPutInstruction,
} from './asset-upload.types';

export interface PutOptions {
  /** 0–100 của RIÊNG bước tải nội dung. */
  onProgress: (percent: number) => void;
  signal?: AbortSignal;
  createXhr?: () => XMLHttpRequest;
}

/** Header trình duyệt cấm đặt bằng tay — `Content-Length` tự lấy từ body (= `file.size`, đúng giá trị BE đã ký). */
const BROWSER_MANAGED_HEADERS = new Set(['content-length', 'host', 'origin', 'user-agent']);

export const abortError = (): DOMException => new DOMException('Đã huỷ tải lên', 'AbortError');

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortError());
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError());
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * `PRESIGNED_PUT` (S3) — tải THẲNG lên storage bằng `XMLHttpRequest` PUT vì chỉ XHR có
 * `upload.onprogress` (fetch chưa báo được tiến độ tải lên). KHÔNG gửi cookie/Authorization:
 * URL đã tự mang chữ ký, thêm credentials chỉ làm CORS của bucket từ chối.
 */
export function putPresigned(
  instruction: PresignedPutInstruction,
  file: File,
  { onProgress, signal, createXhr = () => new XMLHttpRequest() }: PutOptions,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(abortError());

    const xhr = createXhr();
    const onAbort = () => xhr.abort();
    const done = (settle: () => void) => {
      signal?.removeEventListener('abort', onAbort);
      settle();
    };

    xhr.open('PUT', instruction.url);
    for (const [name, value] of Object.entries(instruction.headers)) {
      if (!BROWSER_MANAGED_HEADERS.has(name.toLowerCase())) xhr.setRequestHeader(name, value);
    }
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () =>
      done(() =>
        xhr.status >= 200 && xhr.status < 300
          ? resolve()
          : reject(
              new AssetUploadError(
                'ASSET_PUT_FAILED',
                `Tải lên storage thất bại (HTTP ${xhr.status})`,
                xhr.status,
              ),
            ),
      );
    xhr.onerror = () =>
      done(() =>
        reject(new AssetUploadError('ASSET_PUT_FAILED', 'Mất kết nối khi tải tệp lên storage')),
      );
    xhr.onabort = () => done(() => reject(abortError()));

    signal?.addEventListener('abort', onAbort, { once: true });
    xhr.send(file);
  });
}

/**
 * `API_PUT` (Local/Cloudinary, hoặc S3 khi `STORAGE_PUBLIC_UPLOAD=false`) — multipart tới
 * `PUT /assets/:id/content` qua `apiClient` (tự gắn Bearer + refresh 401). Trường tệp PHẢI tên
 * `file`. BE nhận xong là tự chuyển `PROCESSING` (ảnh nhỏ có thể đã `READY`) nên trả luôn `AssetDto`.
 * `timeout: 0` — tệp lớn qua mạng chậm dễ vượt timeout mặc định của apiClient; huỷ bằng `signal`.
 */
export async function putApiContent(
  assetId: string,
  file: File,
  { onProgress, signal }: PutOptions,
): Promise<AssetDto> {
  const form = new FormData();
  form.append('file', file, file.name);
  const res = await apiClient.put<ApiResponse<AssetDto>>(`/assets/${assetId}/content`, form, {
    signal,
    timeout: 0,
    onUploadProgress: (e) => {
      if (e.total) onProgress(Math.round((e.loaded / e.total) * 100));
    },
  });
  return res.data.data;
}
