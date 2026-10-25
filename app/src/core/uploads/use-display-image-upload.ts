import { useCallback, useEffect, useRef, useState } from 'react';

import { prepareImageForUpload } from '@/core/media/prepare-image';
import { pickImages, takePhoto } from '@/core/media/pick-media';

import { useUploadStore } from './upload.store';
import { useUpload } from './use-upload';

export type ImageSource = 'camera' | 'library';

export interface UseDisplayImageUploadArgs {
  /** Khoá riêng của MỘT ô ảnh (vd `me-avatar`, `workspace-cover:<wsId>`) — hai ô cùng màn không thấy tệp của nhau. */
  slot: string;
  /** Gọi ĐÚNG MỘT LẦN cho mỗi ảnh mới khi tải xong (`ready`) — nơi gọi PATCH đối tượng với `assetId`. */
  onReady: (assetId: string) => void;
}

export interface DisplayImageUpload {
  /** Đang nén/tải ảnh vừa chọn — khoá nút đổi ảnh, hiện vòng chờ trên ảnh xem trước. */
  busy: boolean;
  /** Mã lỗi khi tải hỏng (`ASSET_002` quá lớn, `ASSET_001` sai loại, mã HTTP/mạng…). */
  errorCode?: string;
  failed: boolean;
  /** URI CỤC BỘ của ảnh vừa chọn — hiện NGAY trong lúc tải, trước khi server trả URL mới. */
  previewUri?: string;
  /** Mở máy ảnh/thư viện → nén → tải (scope `AVATAR`). Người dùng huỷ hoặc từ chối quyền ⇒ không làm gì. */
  pick: (source: ImageSource) => Promise<void>;
  retry: () => void;
  /**
   * Bỏ ảnh cục bộ khỏi hàng đợi — gọi sau khi PATCH xong (server đã có URL mới) hoặc khi PATCH lỗi/người dùng bỏ ảnh.
   * ⛔ Chỉ `removeItem`, KHÔNG `cancelUpload`: cái sau gọi `abortAsset` — với asset đã READY là huỷ tệp vừa lưu.
   */
  reset: () => void;
}

/**
 * Chọn + tải MỘT ảnh hiển thị (ảnh đại diện người dùng/nhóm/nhóm chat, ảnh bìa nhóm) — dùng chung cho mọi màn đổi ảnh.
 * Mẫu gốc: `features/career/hooks/usePortfolioImage.ts` (cùng scope `AVATAR`), khác ở chỗ LUÔN nén (`prepareImageForUpload`,
 * trần 2 MiB của BE) và báo `onReady` qua ref nên nơi gọi truyền hàm mới mỗi lần vẽ cũng không bị gọi lặp.
 */
export function useDisplayImageUpload({ slot, onReady }: UseDisplayImageUploadArgs): DisplayImageUpload {
  const { enqueue, items, retry } = useUpload('AVATAR', `display-image:${slot}`);
  const item = items[0];
  const [preparing, setPreparing] = useState(false);
  const onReadyRef = useRef(onReady);
  const reportedRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);

  // Tải xong là sự kiện BÊN NGOÀI (hàng đợi chạy nền) ⇒ effect là đúng chỗ; `reportedRef` chặn báo lặp cùng một asset.
  const readyAssetId = item?.status === 'ready' ? item.assetId : undefined;
  useEffect(() => {
    if (!readyAssetId || reportedRef.current === readyAssetId) return;
    reportedRef.current = readyAssetId;
    onReadyRef.current(readyAssetId);
  }, [readyAssetId]);

  const clearQueue = useCallback(() => {
    const store = useUploadStore.getState();
    items.forEach((queued) => store.removeItem(queued.localId));
  }, [items]);

  const pick = useCallback(
    async (source: ImageSource) => {
      const file =
        source === 'camera'
          ? await takePhoto()
          : (await pickImages({ allowsMultipleSelection: false, selectionLimit: 1 }))[0];
      if (!file) return;
      setPreparing(true);
      try {
        const prepared = await prepareImageForUpload(file);
        clearQueue(); // mỗi ô chỉ MỘT ảnh: ảnh mới thay ảnh đang chờ
        reportedRef.current = undefined;
        enqueue([prepared]);
      } finally {
        setPreparing(false);
      }
    },
    [clearQueue, enqueue],
  );

  const failed = item?.status === 'failed';
  const uploading = item !== undefined && item.status !== 'ready' && !failed && item.status !== 'cancelled';

  return {
    busy: preparing || uploading,
    errorCode: item?.status === 'failed' ? item.errorCode : undefined,
    failed,
    previewUri: item && !failed && item.status !== 'cancelled' ? item.uri : undefined,
    pick,
    reset: clearQueue,
    retry: () => {
      if (item) retry(item.localId);
    },
  };
}
