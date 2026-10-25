import { useState } from 'react';

import { pickDocuments } from '@/core/media/pick-media';
import { cancelUpload } from '@/core/uploads/upload.runner';
import { useUploadStore } from '@/core/uploads/upload.store';
import { useUpload } from '@/core/uploads/use-upload';
import { showToast } from '@/shared/utils/toast.utils';

import { validatePrintFile } from '../utils/print-file';

/**
 * Tải PDF lên để in — dùng lại hàng đợi upload chung (`core/uploads`), scope `PRINT` (BE `upload.scopeRestrict.PRINT`: PDF ≤ 25 MB).
 * `scopeKey` riêng cho từng màn cấu hình để hai màn không thấy tệp của nhau (`useUpload` lọc theo `scopeKey`).
 *
 * ⛔ Chỉ trả `assetId` khi `status === 'ready'`: tạo đơn từ asset chưa READY là `O2O_003`, và tệ hơn là đơn nháp hỏng rồi mới biết.
 * Mỗi lượt CHỈ MỘT tệp: chọn tệp mới thay tệp cũ (đơn nháp cũ, nếu đã tạo, do màn cấu hình xử lý).
 */
export function usePrintUpload(scopeKey: string) {
  const { items, enqueue, retry } = useUpload('PRINT', scopeKey);
  const [problem, setProblem] = useState<string | null>(null);
  const visible = items.filter((item) => item.status !== 'cancelled');
  const current = visible[0];

  function remove(localId: string) {
    const status = useUploadStore.getState().items[localId]?.status;
    if (status === 'ready' || status === 'failed') useUploadStore.getState().removeItem(localId);
    else cancelUpload(localId);
  }

  const pick = async () => {
    // Trình chọn có thể ném (quyền bị thu hồi, không có ứng dụng quản lý tệp…): phải tự bắt, nếu không thành Promise reject vô chủ.
    try {
      const file = (await pickDocuments())[0];
      if (!file) return;
      const error = validatePrintFile(file);
      setProblem(error);
      if (error) return;
      visible.forEach((item) => remove(item.localId));
      enqueue([file]);
    } catch {
      showToast('error', 'Không mở được bộ chọn tệp. Hãy thử lại.');
    }
  };

  return {
    item: current,
    assetId: current?.status === 'ready' ? current.assetId : undefined,
    /** Đang tải lên/xử lý — màn chờ, chưa tạo đơn. */
    uploading: current !== undefined && current.status !== 'ready' && current.status !== 'failed',
    failed: current?.status === 'failed',
    /** Lỗi chọn tệp (không phải PDF, quá lớn) — hiện dưới nút chọn tệp. */
    problem,
    pick,
    remove,
    retry,
  };
}
