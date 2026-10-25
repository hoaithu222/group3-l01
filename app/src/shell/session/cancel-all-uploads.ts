import { cancelTask } from '@/core/uploads/upload.active-tasks';
import { useUploadStore } from '@/core/uploads/upload.store';

/**
 * Huỷ MỌI upload đang chờ/đang chạy — mọi scope (tin nhắn, thẻ, tài liệu, biên lai…).
 *
 * ⛔ Trước đây chỉ scope `RESOURCE` được dọn lúc đăng xuất (`resetResourceStores`). Hàng đợi
 * chung `core/uploads` còn nguyên: tệp của người trước tiếp tục tải lên và, tệ hơn, chạy tiếp
 * bằng access token của NGƯỜI SAU — tệp của A gắn vào phạm vi của B.
 *
 * Chỉ huỷ phía máy (task native + hàng đợi), KHÔNG gọi `POST /assets/:id/abort`: lúc phiên
 * chết không còn token để gọi, và job `assets.cleanup` của BE dọn asset mồ côi — cùng lối
 * `dropWorkspaceUploads` ở `features/resources`.
 */
export function cancelAllUploads(): void {
  const { clear, items } = useUploadStore.getState();
  Object.keys(items).forEach((localId) => cancelTask(localId));
  clear();
}
