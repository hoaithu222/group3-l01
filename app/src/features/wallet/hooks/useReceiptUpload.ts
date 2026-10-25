import { pickImages, takePhoto } from '@/core/media/pick-media';
import { cancelUpload } from '@/core/uploads/upload.runner';
import { useUploadStore } from '@/core/uploads/upload.store';
import { useUpload } from '@/core/uploads/use-upload';
import type { PickedFile } from '@/core/uploads/upload.types';
import { showToast } from '@/shared/utils/toast.utils';

/**
 * Ảnh hoá đơn/chứng từ — dùng lại hàng đợi upload chung (`core/uploads`).
 *
 * Lựa chọn scope: `WORKSPACE` + kind `IMAGE`. BE (`mime-policy.ts`) chỉ chặn `AVATAR`
 * phải là ảnh; `WORKSPACE` nhận `image/jpeg|png|webp|heic` như các scope khác, và
 * ảnh hoá đơn/chứng từ gắn vào NHÓM. `RESOURCE` không hợp (bắt `workspaceId` + hạn
 * mức dung lượng thư viện). `scopeKey` riêng cho từng form để hai màn không thấy
 * ảnh của nhau (`useUpload` lọc theo `scopeKey`).
 *
 * ⛔ Chỉ trả `assetId` khi `status === 'ready'` — gắn ảnh chưa READY vào khoản chi
 * là `WALLET_003`, và tệ hơn là khoản chi lưu xong mới phát hiện ảnh hỏng.
 */
export function useReceiptUpload(scopeKey: string) {
  const { items, enqueue, retry } = useUpload('WORKSPACE', scopeKey);
  const visible = items.filter((item) => item.status !== 'cancelled');
  const current = visible[0];

  const start = (file: PickedFile | null | undefined) => {
    if (!file) return;
    // Mỗi form CHỈ một ảnh: chọn ảnh mới thay ảnh cũ thay vì xếp chồng.
    visible.forEach((item) => remove(item.localId));
    enqueue([file]);
  };

  function remove(localId: string) {
    const status = useUploadStore.getState().items[localId]?.status;
    if (status === 'ready' || status === 'failed') useUploadStore.getState().removeItem(localId);
    else cancelUpload(localId);
  }

  return {
    items: visible,
    assetId: current?.status === 'ready' ? current.assetId : undefined,
    /** Có ảnh đang tải/xử lý — nút Lưu phải chờ (không có `assetId` thì sẽ lưu KHÔNG kèm ảnh mà người dùng tưởng đã kèm). */
    pending: current !== undefined && current.status !== 'ready' && current.status !== 'failed',
    failed: current?.status === 'failed',
    // Nơi gọi là `void receipt.pickFromLibrary()`: trình chọn ném (không có camera, quyền bị thu hồi…) thì phải tự bắt,
    // nếu không thành Promise reject vô chủ (bản dev hiện LogBox "Uncaught (in promise)" ở đáy màn).
    pickFromLibrary: async () => {
      try {
        start((await pickImages({ allowsMultipleSelection: false, selectionLimit: 1 }))[0]);
      } catch {
        showToast('error', 'Không mở được thư viện ảnh. Hãy thử lại.');
      }
    },
    takePhoto: async () => {
      try {
        start(await takePhoto());
      } catch {
        showToast('error', 'Không mở được máy ảnh. Hãy thử lại.');
      }
    },
    remove,
    retry,
  };
}
