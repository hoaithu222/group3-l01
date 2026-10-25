import { retryUpload } from '@/core/uploads/upload.runner';
import { useUpload } from '@/core/uploads/use-upload';
import type { UploadItem } from '@/core/uploads/upload.types';
import { showToast } from '@/shared/utils/toast.utils';

import { pickStudyAudio, pickStudyImage } from '../utils/pick-study-media';
import { dismissUpload, isUploadBusy, uploadsOfSlot } from '../utils/upload-slots';

export interface MediaSlotController {
  /** Có tệp đang tải/xử lý/chờ mạng — chặn Lưu. */
  busy: boolean;
  /** Xoá tệp đang tải (hoặc đã lỗi) khỏi ô. */
  dismiss: () => void;
  kind: 'audio' | 'image';
  /** Chọn tệp mới — thay tệp đang tải của ô này (nếu có). */
  pick: () => Promise<void>;
  /** Tệp đã `READY` (chưa ai gắn vào mục/bộ) — `undefined` khi chưa có. */
  readyAssetId: string | undefined;
  retry: () => void;
  /** Tệp còn dang dở (đang tải hoặc lỗi) để vẽ khay tiến độ; `ready` không nằm đây. */
  upload: UploadItem | undefined;
}

/**
 * MỘT ô media (ảnh hoặc âm thanh) trên hàng đợi upload chung — `scope: 'STUDY'`, `scopeKey` riêng của ô.
 *
 * Mỗi ô CHỈ giữ một tệp: chọn tệp mới thay tệp cũ (huỷ nếu đang tải), giống `useReceiptUpload`. Hàng đợi (tối đa 2 tệp
 * chạy song song, tự tạm dừng khi mất mạng, thử lại theo `assetId` cũ) là của `core/uploads` — hook này chỉ chọn tệp, kiểm
 * luật scope `STUDY` (`pick-study-media.ts`) và lọc tệp của ô.
 *
 * ⚠️ Trình chọn có thể NÉM (không có thư viện ảnh, quyền bị thu hồi, nén lỗi): phải tự bắt, nếu không thành Promise reject vô
 * chủ (bản dev hiện LogBox "Uncaught (in promise)" ở đáy màn).
 */
export function useMediaSlot(scopeKey: string, kind: 'audio' | 'image'): MediaSlotController {
  const { enqueue, items } = useUpload('STUDY', scopeKey);
  const live = items.filter((item) => item.status !== 'cancelled');
  const current = live[live.length - 1];

  async function pick(): Promise<void> {
    try {
      const result = kind === 'image' ? await pickStudyImage() : await pickStudyAudio();
      if (!result) return;
      if ('error' in result) {
        showToast('error', result.error);
        return;
      }
      // Đọc lại từ store SAU khi trình chọn đóng: trong lúc người dùng chọn, tệp cũ có thể đã xong/lỗi.
      uploadsOfSlot(scopeKey).forEach((item) => dismissUpload(item.localId));
      enqueue([result.file]);
    } catch {
      showToast(
        'error',
        kind === 'image'
          ? 'Không mở được thư viện ảnh. Hãy thử lại.'
          : 'Không mở được trình chọn tệp. Hãy thử lại.',
      );
    }
  }

  return {
    busy: current !== undefined && isUploadBusy(current.status),
    dismiss: () => live.forEach((item) => dismissUpload(item.localId)),
    kind,
    pick,
    readyAssetId: current?.status === 'ready' ? current.assetId : undefined,
    retry: () => {
      if (current) retryUpload(current.localId);
    },
    upload: current && current.status !== 'ready' ? current : undefined,
  };
}
