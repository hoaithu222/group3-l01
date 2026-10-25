import { useEffect, useState } from 'react';

import { pickImages } from '@/core/media/pick-media';
import { useAssetUrl } from '@/core/uploads/use-asset-url';
import { useUploadStore } from '@/core/uploads/upload.store';
import { useUpload } from '@/core/uploads/use-upload';

export interface UsePortfolioImageArgs {
  /** Asset đang gắn với hồ sơ/dự án (từ server hoặc form); `null` = chưa có ảnh riêng. */
  assetId: string | null;
  /** Gọi khi ảnh MỚI tải xong (`ready`) — nơi gọi ghi `assetId` vào form. */
  onReady: (assetId: string) => void;
}

/**
 * Chọn + tải MỘT ảnh cho portfolio (ảnh đại diện riêng, ảnh bìa dự án) — app.md p6-07 §6. BE chưa có scope `PORTFOLIO` cho `POST /assets` nên dùng `AVATAR` (ảnh):
 * upload xong ra `assetId` rồi gửi kèm `avatarAssetId`/`coverAssetId` (BE kiểm asset READY của CHÍNH người dùng, `ASSET_003` nếu không).
 *
 * Hiển thị: ảnh vừa chọn dùng URI cục bộ (thấy ngay, không chờ tải xong); ảnh đã lưu lấy URL ký ngắn hạn qua `useAssetUrl` (⚠️ URL hết hạn ~1 phút nên không
 * lưu vào form/state — chỉ `assetId`).
 */
export function usePortfolioImage({ assetId, onReady }: UsePortfolioImageArgs) {
  // Khoá riêng theo lần mở màn: hai ô ảnh (đại diện/bìa) cùng scope `AVATAR` không được thấy tệp của nhau.
  const [scopeKey] = useState(() => `portfolio-image-${String(Date.now())}`);
  const { enqueue, items, retry } = useUpload('AVATAR', scopeKey);
  const item = items[0];
  const remote = useAssetUrl(item ? undefined : (assetId ?? undefined), 'THUMB');

  // Tệp tải xong là sự kiện BÊN NGOÀI (hàng đợi upload chạy nền), không phải khởi tạo state từ prop ⇒ effect ở đây đúng chỗ (cùng mẫu `DetailsStep` của conversations).
  // `!== assetId`: chỉ báo khi ảnh THẬT SỰ mới — `onReady` đổi tham chiếu mỗi lần vẽ, không có điều kiện này thì effect chạy lại và ghi cùng giá trị mãi.
  useEffect(() => {
    if (item?.status === 'ready' && item.assetId && item.assetId !== assetId) onReady(item.assetId);
  }, [item?.status, item?.assetId, assetId, onReady]);

  const failed = item?.status === 'failed';
  const busy =
    item !== undefined && item.status !== 'ready' && !failed && item.status !== 'cancelled';
  const uri = item && !failed ? item.uri : remote.data?.url;

  const pick = async (): Promise<void> => {
    const [file] = await pickImages({ allowsMultipleSelection: false, selectionLimit: 1 });
    if (file) enqueue([file]);
  };

  return {
    busy,
    /**
     * Bỏ ảnh đang chọn. ⛔ Gỡ mục khỏi hàng đợi CỤC BỘ (`removeItem`), KHÔNG `cancelUpload`: cái sau gọi `abortAsset` lên server — với asset đã `ready` là huỷ
     * một tệp đã lưu. Mục ở lại trong hàng đợi thì effect trên ghi lại `assetId` cũ vào form ngay sau khi người dùng vừa xoá.
     */
    clear: () => {
      if (item) useUploadStore.getState().removeItem(item.localId);
    },
    failed,
    pick,
    retry: () => {
      if (item) retry(item.localId);
    },
    uri,
  };
}
