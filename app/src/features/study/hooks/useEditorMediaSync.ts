import { useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { useUploadStore } from '@/core/uploads/upload.store';

import { itemScopePrefix, parseItemSlotScopeKey, type MediaSlot } from '../utils/media-slots';
import { isUploadBusy } from '../utils/upload-slots';

export interface EditorMediaStatus {
  /** Số tệp tải LỖI của bộ này — chặn Lưu cho tới khi thử lại hoặc bỏ tệp đó (không im lặng bỏ ảnh người dùng đã chọn). */
  failed: number;
  /** Số tệp còn đang tải/xử lý/chờ mạng — chặn Lưu (BE `STUDY_006` nếu asset chưa READY). */
  pending: number;
}

/**
 * Nối hàng đợi upload với NHÁP của trình soạn: tệp `scope: 'STUDY'` của bộ này vừa `READY` thì ghi `assetId` vào ĐÚNG ô
 * của mục (`apply`), rồi gỡ khỏi hàng đợi. Nháp chỉ bao giờ chứa asset đã READY — nên "N thay đổi chưa lưu" và `PUT items`
 * không có ca "ảnh đang tải dở".
 *
 * ── Vì sao ở MÀN chứ không ở từng ô ──────────────────────────────────────────
 * Trên điện thoại form mục chỉ nằm trên màn khi đang mở; bấm "Xong" về danh sách là ô unmount. Ô mà tự ghi `assetId` lúc
 * READY thì tệp xong SAU khi đóng form sẽ "tải xong mà không thấy đâu" — cùng lỗi mà `useTaskAttachmentFinalizer` (boards)
 * được sinh ra để tránh. Màn soạn sống suốt phiên soạn nên là nơi đúng.
 *
 * ⚠️ Mục/lựa chọn bị xoá trong lúc tệp còn tải thì `apply` không làm gì (không tạo lại mục) và tệp bị gỡ — asset mồ côi để job
 * dọn của BE thu hồi (be.md p0-05).
 */
export function useEditorMediaSync(
  setId: string,
  apply: (itemKey: string, slot: MediaSlot, assetId: string) => void,
): EditorMediaStatus {
  // `useShallow`: chỉ vẽ lại khi tệp CỦA BỘ NÀY đổi — tiến độ tải của chat/kho tài liệu chạy nền không kéo cả trình soạn (tới 500
  // mục) vẽ lại theo.
  const mine = useUploadStore(
    useShallow((state) =>
      Object.values(state.items).filter(
        (item) => item.scope === 'STUDY' && item.scopeKey?.startsWith(itemScopePrefix(setId)),
      ),
    ),
  );

  useEffect(() => {
    mine.forEach((upload) => {
      if (upload.status === 'cancelled') {
        useUploadStore.getState().removeItem(upload.localId);
        return;
      }
      if (upload.status !== 'ready' || !upload.assetId) return;
      const target = parseItemSlotScopeKey(upload.scopeKey);
      if (target) apply(target.itemKey, target.slot, upload.assetId);
      useUploadStore.getState().removeItem(upload.localId);
    });
  }, [apply, mine]);

  return {
    failed: mine.filter((item) => item.status === 'failed').length,
    pending: mine.filter((item) => isUploadBusy(item.status)).length,
  };
}
