import * as FileSystem from 'expo-file-system/legacy';

import { apiClient, unwrapData } from '@/core/api';

import { assetContentPath } from './upload.api';
import type { AssetDto, UploadItem } from './upload.types';

export interface CancellableUpload<T = void> {
  promise: Promise<T>;
  /** Huỷ NGAY — không đợi round-trip mạng. `upload.pipeline.ts` tự cập nhật store. */
  cancel: () => void;
}

/**
 * Mỗi lần `onProgress` ghi vào store ⇒ mọi nơi chọn `items` (khung soạn tin, khay đính kèm) render lại. Native báo hàng chục lần/giây nên chỉ đẩy khi
 * nhích ≥ 5 điểm phần trăm (hoặc chạm 100) — thanh tiến trình vẫn mượt mà khung soạn không bị vẽ lại liên tục trong lúc tải.
 */
function throttleProgress(onProgress: (percent: number) => void): (percent: number) => void {
  let last = -Infinity;
  return (percent) => {
    if (percent < 100 && percent - last < 5) return;
    last = percent;
    onProgress(percent);
  };
}

/**
 * `PRESIGNED_PUT` (S3) — tải THẲNG lên storage, không qua backend.
 *
 * ⚠️ Phải `import * as FileSystem from 'expo-file-system/legacy'` — bản gốc
 * (`expo-file-system`) đã đổi hẳn sang API `File`/`Directory` ở SDK 57 và
 * `createUploadTask` NÉM LỖI lúc chạy nếu gọi từ đó (xem
 * `node_modules/expo-file-system/src/legacyWarnings.ts`).
 */
export function putPresigned(
  url: string,
  headers: Record<string, string>,
  item: UploadItem,
  onProgress: (percent: number) => void,
): CancellableUpload {
  const report = throttleProgress(onProgress);
  const task = FileSystem.createUploadTask(
    url,
    item.uri,
    {
      httpMethod: 'PUT',
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
      headers: { ...headers, 'Content-Type': item.mime },
    },
    (data) => {
      if (data.totalBytesExpectedToSend > 0) {
        report(Math.round((data.totalBytesSent / data.totalBytesExpectedToSend) * 100));
      }
    },
  );

  const promise = task.uploadAsync().then((result) => {
    // `result` rỗng khi bị `cancelAsync()` huỷ giữa chừng — `upload.pipeline.ts`
    // phân biệt huỷ chủ động với lỗi thật bằng CHÍNH trạng thái trong store
    // (đặt trước khi gọi `cancel()`), không đọc lỗi này.
    if (!result || result.status >= 300) {
      throw new Error(`Tải lên thất bại (HTTP ${result?.status ?? '??'})`);
    }
  });

  return { promise, cancel: () => void task.cancelAsync() };
}

/**
 * `API_PUT` (fallback Local/Cloudinary) — đi qua chính API `PUT /assets/:id/content`.
 *
 * ⚠️ Khác `PRESIGNED_PUT`: BE tự CHỐT asset ngay trong lời gọi này (`AssetService.uploadContent` → `finalize`: `PROCESSING`,
 * ảnh nhỏ chạy fast-path → `READY`) và trả `AssetDto` mới nhất. Vì vậy KHÔNG được gọi thêm `POST /assets/:id/complete` sau
 * đó — asset không còn `UPLOADING` nên BE trả 403 `ASSET_004`, và mọi ảnh/tệp/tin thoại đều hỏng ở bước cuối.
 */
export function putApiMultipart(
  assetId: string,
  item: UploadItem,
  onProgress: (percent: number) => void,
): CancellableUpload<AssetDto> {
  const report = throttleProgress(onProgress);
  const controller = new AbortController();
  const form = new FormData();
  // React Native `FormData` nhận `{ uri, name, type }` thay vì `File` — giống
  // `client.ts` đã ghi chú (interceptor tự xoá `Content-Type` cho `FormData`).
  form.append('file', { uri: item.uri, name: item.name, type: item.mime } as unknown as Blob);

  const promise = apiClient
    .put(assetContentPath(assetId), form, {
      signal: controller.signal,
      onUploadProgress: (event) => {
        if (event.total) report(Math.round((event.loaded / event.total) * 100));
      },
    })
    .then((response) => unwrapData<AssetDto>(response));

  return { promise, cancel: () => controller.abort() };
}
