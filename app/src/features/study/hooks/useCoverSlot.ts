import { useEffect, useState } from 'react';

import { coverScopeKey } from '../utils/media-slots';
import { dismissUpload, uploadsOfSlot } from '../utils/upload-slots';
import { useMediaSlot, type MediaSlotController } from './useMediaSlot';

export interface CoverSlot {
  /** Ảnh bìa đang hiển thị: tệp vừa tải xong > ảnh sẵn có (trừ khi đã bấm Xoá). */
  assetId: string | null;
  /** Còn tệp đang tải hoặc lỗi — khoá nút gửi form (asset chưa READY thì BE từ chối `STUDY_006`). */
  blocked: boolean;
  /** Bấm "Xoá ảnh": gỡ ảnh đang hiển thị (và tệp vừa chọn nếu có). */
  clear: () => void;
  slot: MediaSlotController;
  /** Giá trị gửi lên BE: chuỗi = ảnh mới · `null` = gỡ ảnh bìa sẵn có · `undefined` = KHÔNG ĐỔI (không gửi trường). */
  value: string | null | undefined;
}

/**
 * Ảnh bìa của bộ (`coverAssetId`) cho form tạo/sửa thông tin bộ.
 *
 * Khác ô của mục: bộ chưa có nháp trong store để ghi `assetId` vào, nên trạng thái "đã chọn ảnh bìa nào" được SUY RA lúc vẽ
 * từ hàng đợi upload (tệp `ready` của khoá này) — không cần effect ghi ngược, và không có khoảnh khắc "tải xong mà chưa ghi".
 * `scopeId` là `setId` (sửa) hoặc `Idempotency-Key` của lượt tạo (tạo — bộ chưa có id).
 *
 * Rời form thì dọn mọi tệp của khoá này khỏi hàng đợi: tệp chưa xong bị huỷ, tệp đã READY được BE gắn (tạo/sửa thành công)
 * hoặc để job dọn mồ côi thu hồi (bỏ form).
 */
export function useCoverSlot(scopeId: string, initialAssetId: string | null): CoverSlot {
  const key = coverScopeKey(scopeId);
  const slot = useMediaSlot(key, 'image');
  const [cleared, setCleared] = useState(false);

  useEffect(() => () => uploadsOfSlot(key).forEach((item) => dismissUpload(item.localId)), [key]);

  return {
    assetId: slot.readyAssetId ?? (cleared ? null : initialAssetId),
    blocked: slot.upload !== undefined,
    clear: () => {
      setCleared(true);
      slot.dismiss();
    },
    slot,
    value: slot.readyAssetId ?? (cleared && initialAssetId ? null : undefined),
  };
}
