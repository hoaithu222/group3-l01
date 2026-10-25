import { cancelUpload } from '@/core/uploads/upload.runner';
import { useUploadStore } from '@/core/uploads/upload.store';
import type { UploadItem } from '@/core/uploads/upload.types';

/** Còn đang chờ/đang chạy — chặn nút Lưu (tệp chưa READY thì BE từ chối `STUDY_006`). `failed` tính riêng. */
const BUSY_STATUSES = new Set<UploadItem['status']>([
  'queued',
  'creating',
  'uploading',
  'paused',
  'processing',
]);

export function isUploadBusy(status: UploadItem['status']): boolean {
  return BUSY_STATUSES.has(status);
}

/**
 * Dọn MỘT tệp khỏi hàng đợi: tệp xong/lỗi/đã huỷ chỉ cần xoá khỏi store; tệp đang chạy phải HUỶ thật (dừng tải, báo BE
 * `abort`) — xoá khỏi store mà không huỷ thì tác vụ native vẫn chạy nốt và để lại asset mồ côi.
 */
export function dismissUpload(localId: string): void {
  const status = useUploadStore.getState().items[localId]?.status;
  if (status === 'ready' || status === 'failed' || status === 'cancelled') {
    useUploadStore.getState().removeItem(localId);
  } else if (status !== undefined) {
    cancelUpload(localId);
  }
}

function studyUploads(): UploadItem[] {
  return Object.values(useUploadStore.getState().items).filter((item) => item.scope === 'STUDY');
}

/**
 * Tệp của ĐÚNG một ô. ⛔ So bằng, không `startsWith`: khoá lựa chọn có thể là tiền tố của khoá lựa chọn khác
 * (`…:opt.o_a` ⊂ `…:opt.o_ab`) và thay tệp của ô này không được động vào ô kia.
 */
export function uploadsOfSlot(scopeKey: string): UploadItem[] {
  return studyUploads().filter((item) => item.scopeKey === scopeKey);
}

/** Rời màn (bỏ nháp/đóng form): huỷ mọi tệp còn tải và xoá phần còn lại khỏi hàng đợi. `prefix` là tiền tố `scopeKey`. */
export function dismissUploadsWithPrefix(prefix: string): void {
  studyUploads()
    .filter((item) => item.scopeKey?.startsWith(prefix))
    .forEach((item) => dismissUpload(item.localId));
}
